/*jshint node:true, mocha:true*/

describe('UIRecorder', function () {
    'use strict';

    var testFixture = require('../../globals'),
        expect = testFixture.expect,
        gmeConfig = testFixture.getGmeConfig(),
        logger = testFixture.logger.fork('UIRecorder'),
        Q = testFixture.Q,
        mongo = require('mongodb'),
        controller = testFixture.requirejs('panels/UIReplay/UIReplayControllers'),
        server = testFixture.WebGME.standaloneServer(gmeConfig),
        commits = [],
        wRec,
        gmeAuth,
        dbConn,
        storage;

    function getRecData(projectId, commitObj) {
        return {
            _id: commitObj._id,
            projectId: projectId,
            uiState: {
                myState: 'Hello'
            },
            commitObject: commitObj,
            coreObjects: {},
            changedNodes: {}
        };
    }

    before(function (done) {
        testFixture.clearDBAndGetGMEAuth(gmeConfig)
            .then(function (gmeAuth_) {
                gmeAuth = gmeAuth_;
                storage = testFixture.getMongoStorage(logger, gmeConfig, gmeAuth);
                return Q.allDone([
                    testFixture.WebGME.getComponentsJson(logger),
                    storage.openDatabase()
                ]);
            })
            .then(function (res) {
                return Q.ninvoke(mongo.MongoClient, 'connect',
                    res[0].UIRecorderRouter.mongo.uri, res[0].UIRecorderRouter.mongo.options);
            })
            .then(function (dbConn_) {
                dbConn = dbConn_;
                return Q.allDone([
                    testFixture.importProject(storage, {
                        projectSeed: testFixture.path.join(testFixture.SEED_DIR, 'EmptyProject.webgmex'),
                        projectName: 'withRec',
                        branchName: 'master',
                        logger: logger,
                        gmeConfig: gmeConfig
                    })
                ]);
            })
            .then(function (irs) {
                wRec = irs[0].project;

                ['m1', 'm2NoCommitInit', 'm3OtherUser', 'm4OtherUser'].reduce(function (commitObj, msg) {
                    var parents = commitObj ? [commitObj._id] : [irs[0].commitHash],
                        newCommit = wRec.createCommitObject(parents, irs[0].rootHash,
                            commits.length > 1 ? msg : 'guest',
                            msg);

                    commits.push(newCommit);
                    return newCommit;
                }, null);

                return storage._getProject({projectId: wRec.projectId});

            })
            .then(function (dbProject) {
                return Q.allDone(commits.map(function (commitObj) {
                    return dbProject.insertObject(commitObj);
                }));
            })
            .then(function () {
                return Q.allDone([
                    Q.ninvoke(dbConn, 'dropCollection', wRec.projectId),
                    wRec.createBranch('b1', commits[0]._id),
                    wRec.createBranch('b2', commits[1]._id),
                    wRec.createBranch('b3', commits[2]._id),
                    wRec.createBranch('b4', commits[3]._id)
                ]);
            })
            .then(function () {
                return Q.ninvoke(dbConn, 'collection', wRec.projectId);
            })
            .then(function (coll) {
                return Q.ninvoke(coll, 'insert', getRecData(wRec.projectId, commits[0]));
            })
            .then(function () {
                controller._setUrl(server.getUrl());
                server.start(done);
            })
            .catch(done);
    });

    after(function (done) {
        gmeAuth.unload()
            .then(function () {
                return Q.allDone([
                    storage.closeDatabase(),
                    Q.ninvoke(dbConn, 'close')
                ]);
            })
            .finally(function () {
                server.stop(done);
            });
    });


    it('getCommitStatus should exist for commit with rec data', function (done) {
        controller.getCommitStatus(wRec.projectId, commits[0]._id)
            .then(function (status) {
                expect(status.exists).to.equal(true);
            })
            .nodeify(done);
    });

    it('getCommitStatus should not exist for commit with no rec data', function (done) {
        controller.getCommitStatus(wRec.projectId, commits[0].parents[0])
            .then(function (status) {
                expect(status.exists).to.equal(false);
            })
            .nodeify(done);
    });

    it('getCommitStatus should not exist for commit that does not exist', function (done) {
        controller.getCommitStatus(wRec.projectId, '#doesNotExist')
            .then(function (status) {
                expect(status.exists).to.equal(false);
            })
            .nodeify(done);
    });

    it('getRecordings should return all including those with no rec data', function (done) {
        controller.getRecordings(wRec.projectId, commits[0]._id, commits[3]._id)
            .then(function (records) {
                expect(records.length).to.equal(4);
                expect(records[0].uiState).to.deep.equal({myState: 'Hello'});
                expect(records[1].uiState).to.deep.equal({});
                expect(records[2].uiState).to.deep.equal({});
                expect(records[3].uiState).to.deep.equal({});
            })
            .nodeify(done);
    });

    it('getRecordings should return empty array if cannot find first commit in history', function (done) {
        controller.getRecordings(wRec.projectId, commits[0]._id, commits[3]._id, 2)
            .then(function (records) {
                expect(records.length).to.equal(0);
            })
            .nodeify(done);
    });

    it('getRecordings should return one commit if start and end same', function (done) {
        controller.getRecordings(wRec.projectId, commits[0]._id, commits[0]._id)
            .then(function (records) {
                expect(records.length).to.equal(1);
            })
            .nodeify(done);
    });

    it('getRecordings should return 404 Not found if end commit does not exist', function (done) {
        controller.getRecordings(wRec.projectId, commits[0]._id, '#doesNotExist')
            .then(function () {
                throw new Error('Should have failed!');
            })
            .catch(function (err) {
                expect(err.status).to.equal(404);
            })
            .nodeify(done);
    });

    it('getBranchStatus should return totalEntries 0 if branch does not exist', function (done) {
        controller.getBranchStatus(wRec.projectId, 'doesNotExist')
            .then(function (res) {
                expect(res).to.deep.equal({
                    totalEntries: 0,
                    commitIndex: -1,
                    commitHash: null
                });
            })
            .nodeify(done);
    });

    it('getBranchStatus should return commitIndex 0 if user made commit', function (done) {
        controller.getBranchStatus(wRec.projectId, 'b1')
            .then(function (res) {
                expect(res).to.deep.equal({
                    totalEntries: 2,
                    commitIndex: 0,
                    commitHash: null
                });
            })
            .nodeify(done);
    });

    it('getBranchStatus should return commitIndex 1 if one commit after user made commit', function (done) {
        controller.getBranchStatus(wRec.projectId, 'b3')
            .then(function (res) {
                expect(res).to.deep.equal({
                    totalEntries: 4,
                    commitIndex: 1,
                    commitHash: commits[2]._id
                });
            })
            .nodeify(done);
    });

    it('getBranchStatus should return commitIndex 2 if two commits after user made commit', function (done) {
        controller.getBranchStatus(wRec.projectId, 'b4')
            .then(function (res) {
                expect(res).to.deep.equal({
                    totalEntries: 5,
                    commitIndex: 2,
                    commitHash: commits[2]._id
                });
            })
            .nodeify(done);
    });

    it('getBranchStatus should return commitIndex -1 if commits after user is more or equal ot maxEntries',
        function (done) {
            controller.getBranchStatus(wRec.projectId, 'b4', 2)
                .then(function (res) {
                    expect(res).to.deep.equal({
                        totalEntries: 2,
                        commitIndex: -1,
                        commitHash: null
                    });
                })
                .nodeify(done);
        }
    );

    it('addRecording should not insert recording if not local data', function (done) {
        var onNewCommitData = {
            data: {
                commitData: {
                    projectId: wRec.projectId,
                    commitObject: commits[1],
                    coreObject: {},
                    changedNodes: {}
                },
                local: false
            },
            uiState: {
                myState: 'Hello'
            }
        };

        controller.addRecording(onNewCommitData)
            .then(function () {
                return controller.getCommitStatus(wRec.projectId, commits[1]._id);
            })
            .then(function (status) {
                expect(status.exists).to.equal(false);
            })
            .nodeify(done);
    });

    it('addRecording should not insert recording if no changedNodes (setBranchHash/undo/redo)',
        function (done) {
            var onNewCommitData = {
                data: {
                    commitData: {
                        projectId: wRec.projectId,
                        commitObject: commits[1],
                        coreObject: {},
                        changedNodes: null
                    },
                    local: false
                },
                uiState: {
                    myState: 'Hello'
                }
            };

            controller.addRecording(onNewCommitData)
                .then(function () {
                    return controller.getCommitStatus(wRec.projectId, commits[1]._id);
                })
                .then(function (status) {
                    expect(status.exists).to.equal(false);
                })
                .nodeify(done);
        }
    );

    it('addRecording should insert recording if local data', function (done) {
        var onNewCommitData = {
            data: {
                commitData: {
                    projectId: wRec.projectId,
                    commitObject: commits[1],
                    coreObject: {},
                    changedNodes: {}
                },
                local: true
            },
            uiState: {
                myState: 'Hello2'
            }
        };

        controller.addRecording(onNewCommitData)
            .then(function () {
                return controller.getRecordings(wRec.projectId, commits[1]._id, commits[1]._id);
            })
            .then(function (records) {
                expect(records.length).to.equal(1);
                expect(records[0].uiState).to.deep.equal({myState: 'Hello2'});
            })
            .nodeify(done);
    });

    // Access check
    it('getCommitStatus should return 403 if no such project', function (done) {
        controller.getCommitStatus('doesNotExist', commits[0]._id)
            .then(function () {
                throw new Error('Should have failed!');
            })
            .catch(function (err) {
                expect(err.status).to.equal(403);
            })
            .nodeify(done);
    });

    it('getRecordings should return 403 if no such project', function (done) {
        controller.getRecordings('doesNotExist', commits[0]._id, '#doesNotExist')
            .then(function () {
                throw new Error('Should have failed!');
            })
            .catch(function (err) {
                expect(err.status).to.equal(403);
            })
            .nodeify(done);
    });

    it('getBranchStatus should return 403 if no such project', function (done) {
        controller.getBranchStatus('doesNotExist', 'master')
            .then(function () {
                throw new Error('Should have failed!');
            })
            .catch(function (err) {
                expect(err.status).to.equal(403);
            })
            .nodeify(done);
    });

    it('addRecording should return 403 if no such project', function (done) {
        var onNewCommitData = {
            data: {
                commitData: {
                    projectId: 'doesNotExist',
                    commitObject: commits[1],
                    coreObject: {},
                    changedNodes: {}
                },
                local: true
            },
            uiState: {
                myState: 'Hello2'
            }
        };

        controller.addRecording(onNewCommitData)
            .then(function () {
                throw new Error('Should have failed!');
            })
            .catch(function (err) {
                expect(err.status).to.equal(403);
            })
            .nodeify(done);
    });
});
