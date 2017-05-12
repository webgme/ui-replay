/*globals define, WebGMEGlobal, _*/
/*jshint browser: true*/

/**
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'q',
    'superagent',
    'js/Constants'
], function (Q, superagent, CONSTANTS) {
    'use strict';

    var url = '';
    // This is only for tests on the server..
    function _setUrl(serverUrl) {
        url = serverUrl;
    }

    function addRecording(cData, callback) {
        var deferred = Q.defer(),
            project = cData.data.commitData.projectId.split('+'),
            data;

        // We're not recording local changes or setBranchHash.
        if (!cData.data.local || !cData.data.commitData.changedNodes) {
            deferred.resolve();
            return deferred.promise.nodeify(callback);
        }

        data = {
            _id: cData.data.commitData.commitObject._id,
            projectId: cData.data.commitData.projectId,
            uiState: cData.uiState,
            commitObject: cData.data.commitData.commitObject,
            coreObjects: cData.data.commitData.coreObjects,
            changedNodes: cData.data.commitData.changedNodes
        };

        superagent.put(url + '/routers/UIRecorder/' + project[0] + '/' + project[1] + '/recording')
            .send(data)
            .end(function (err) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve();
                }
            });

        return deferred.promise.nodeify(callback);
    }

    function getCommitStatus(projectId, commitHash, callback) {
        var deferred = Q.defer(),
            project = projectId.split('+');

        superagent.get(url + '/routers/UIRecorder/' + project[0] + '/' + project[1] + '/status/' + commitHash.slice(1))
            .end(function (err, result) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(result.body);
                }
            });

        return deferred.promise.nodeify(callback);
    }

    function getBranchStatus(projectId, branchName, maxEntriesToCheck, callback) {
        var deferred = Q.defer(),
            project = projectId.split('+');

        superagent.get(url + '/routers/UIRecorder/' + project[0] + '/' + project[1] + '/branchStatus/' + branchName)
            .query({n: maxEntriesToCheck || 100})
            .end(function (err, result) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(result.body);
                }
            });

        return deferred.promise.nodeify(callback);
    }

    function getRecordings(projectId, startCommit, endCommit, maxEntriesToCheck, callback) {
        var deferred = Q.defer(),
            project = projectId.split('+');

        superagent.get(url + '/routers/UIRecorder/' + project[0] + '/' + project[1] +
            '/recordings/' + startCommit.slice(1) + '...' + endCommit.slice(1))
            .query({n: maxEntriesToCheck || 100})
            .end(function (err, result) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(result.body);
                }
            });

        return deferred.promise.nodeify(callback);
    }

    function Player(client) {
        var self = this;

        function copy(obj) {
            return JSON.parse(JSON.stringify(obj));
        }

        this.recording = [];

        this.stateIndex = -1;
        this.commitIndex = -1;

        this.clear = function () {
            self.recording = [];
        };

        this.loadRecordings = function (projectId, startCommit, endCommit, maxNumber, callback) {
            return getRecordings(projectId, startCommit, endCommit, maxNumber)
                .then(function (recordings) {
                    var prevCommit;

                    if (recordings.length === 0) {
                        throw new Error('No recordings found!');
                    }

                    self.recording = recordings;
                    prevCommit = self.recording[0].commitObject.parents[0];

                    return Q.ninvoke(client, 'selectCommit', prevCommit);
                })
                .then(function () {
                    return self.recording;
                })
                .nodeify(callback);
        };

        function loadState(options, uiState) {
            var deferred = Q.defer(),
                currState = WebGMEGlobal.State.toJSON(),
                delay = options.delay || 200,
                delayedState = {},
                newVisualizer,
                changedStates,
                keys,
                i;

            /**
             STATE_ACTIVE_PROJECT_NAME: 'activeProjectName',
             STATE_ACTIVE_COMMIT: 'activeCommit',
             STATE_ACTIVE_BRANCH_NAME: 'activeBranchName',
             STATE_LAYOUT: 'layout',

             STATE_ACTIVE_VISUALIZER: 'activeVisualizer',

             STATE_ACTIVE_OBJECT: 'activeObject',
             STATE_ACTIVE_ASPECT: 'activeAspect',
             STATE_ACTIVE_TAB: 'activeTab',

             STATE_ACTIVE_SELECTION: 'activeSelection',
             */


            // Delete the ones we're not interested in
            delete uiState[CONSTANTS.STATE_ACTIVE_PROJECT_NAME];
            delete uiState[CONSTANTS.STATE_ACTIVE_COMMIT];
            delete uiState[CONSTANTS.STATE_ACTIVE_BRANCH_NAME];
            delete uiState[CONSTANTS.STATE_LAYOUT];

            // Check which states are different from the current one - delete those that aren't.
            keys = Object.keys(uiState);
            for (i = 0; i < keys.length; i += 1) {
                if (uiState[keys[i]] === currState[keys[i]]) {
                    delete uiState[keys[i]];
                } else if (uiState[keys[i]] instanceof Array && currState[keys[i]] instanceof Array) {
                    if (_.difference(uiState[keys[i]], currState[keys[i]]).length === 0) {
                        delete uiState[keys[i]];
                    }
                }
            }

            changedStates = Object.keys(uiState);
            if (Object.keys(uiState).length === 0) {
                deferred.resolve({});
            } else if (changedStates.length === 1) {
                WebGMEGlobal.State.set(uiState, {suppressVisualizerFromNode: true});

                if (uiState.hasOwnProperty(CONSTANTS.STATE_ACTIVE_SELECTION)) {
                    // Only the active selection changed - we can resolve right away.
                    deferred.resolve(uiState);
                } else {
                    setTimeout(function () {
                        deferred.resolve(uiState);
                    }, delay);
                }
            } else {
                newVisualizer = uiState[CONSTANTS.STATE_ACTIVE_VISUALIZER];

                if (newVisualizer) {
                    // First set the new visualizer.
                    WebGMEGlobal.State.registerActiveVisualizer(newVisualizer);
                    delete uiState[CONSTANTS.STATE_ACTIVE_VISUALIZER];
                }

                if (uiState.hasOwnProperty(CONSTANTS.STATE_ACTIVE_SELECTION) &&
                    uiState[CONSTANTS.STATE_ACTIVE_SELECTION].length > 0) {
                    // There is an active-selection..
                    delayedState[CONSTANTS.STATE_ACTIVE_SELECTION] = uiState[CONSTANTS.STATE_ACTIVE_SELECTION];
                    delete uiState[CONSTANTS.STATE_ACTIVE_SELECTION];

                    // .. first set the state w/o the selection..
                    WebGMEGlobal.State.set(uiState, {suppressVisualizerFromNode: true});
                    setTimeout(function () {
                        // .. then we update the active selection.
                        WebGMEGlobal.State.set(delayedState, {suppressVisualizerFromNode: true});

                        // Add it back for UI feedback.
                        uiState[CONSTANTS.STATE_ACTIVE_SELECTION] = delayedState[CONSTANTS.STATE_ACTIVE_SELECTION];
                        if (newVisualizer) {
                            uiState[CONSTANTS.STATE_ACTIVE_VISUALIZER] = newVisualizer;
                        }

                        deferred.resolve(uiState);
                    }, delay * 2);

                } else {
                    // There's no active-selection we can set the entire new state.
                    WebGMEGlobal.State.set(uiState, {suppressVisualizerFromNode: true});
                    setTimeout(function () {

                        if (newVisualizer) {
                            uiState[CONSTANTS.STATE_ACTIVE_VISUALIZER] = newVisualizer;
                        }

                        deferred.resolve(uiState);
                    }, delay);
                }
            }


            return deferred.promise;
        }

        function loadCommit(options, updateData, prevCommit) {
            var commitObject = updateData.commitObject,
                project = client.getProjectObject(),
                hashes = Object.keys(updateData.coreObjects || {}),
                changedNodes = null,
                i;

            project.insertObject(commitObject);

            for (i = 0; i < hashes.length; i += 1) {
                if (updateData.coreObjects[hashes[i]] && updateData.coreObjects[hashes[i]].type === 'patch') {
                    project.insertPatchObject(updateData.coreObjects[hashes[i]]);
                } else {
                    project.insertObject(updateData.coreObjects[hashes[i]]);
                }
            }

            if (commitObject.parents.length === 1 && commitObject.parents[0] === prevCommit) {
                changedNodes = updateData.changedNodes;
            }

            return Q.ninvoke(client, '_selectCommitFilteredEvents', commitObject._id, changedNodes);
        }

        this.stepForwardState = function (options, callback) {
            var deferred;

            options = options || {};

            self.stateIndex += 1;

            if (self.stateIndex >= self.recording.length) {
                deferred = Q.defer();
                deferred.reject(new Error('End of recording reached'));
                return deferred.promise.nodeify(callback);
            } else {
                return loadState(options, copy(self.recording[self.stateIndex].uiState))
                    .then(function (changedState) {
                        return {
                            type: 'state',
                            changedState: changedState
                        };
                    })
                    .nodeify(callback);
            }
        };

        this.stepForwardCommit = function (options, callback) {
            var deferred,
                prevCommit;

            options = options || {};

            if (self.recording[self.commitIndex]) {
                prevCommit = self.recording[self.commitIndex].commitObject._id;
            }

            self.commitIndex += 1;

            if (self.commitIndex >= self.recording.length) {
                deferred = Q.defer();
                deferred.reject(new Error('End of recording reached'));
                return deferred.promise.nodeify(callback);
            } else {
                return loadCommit(options, self.recording[self.commitIndex], prevCommit)
                    .then(function () {
                        return {
                            type: 'commit',
                            commit: self.recording[self.commitIndex].commitObject
                        };
                    })
                    .nodeify(callback);
            }
        };

        this.stepBackState = function (options, callback) {
            var deferred;

            options = options || {};

            self.stateIndex -= 1;

            if (self.stateIndex < 0) {
                deferred = Q.defer();
                deferred.reject(new Error('Beginning of recording reached, cant step back state.'));
                return deferred.promise.nodeify(callback);
            } else {
                return loadState(options, self.recording[self.stateIndex].uiState)
                    .then(function (changedState) {
                        return {
                            type: 'state',
                            changedState: changedState
                        };
                    })
                    .nodeify(callback);
            }
        };

        this.stepBackCommit = function (options, callback) {
            var deferred;

            options = options || {};

            self.commitIndex -= 1;

            if (self.commitIndex < 0) {
                deferred = Q.defer();
                deferred.reject(new Error('Beginning of recording reached, cant step back commit.'));
                return deferred.promise.nodeify(callback);
            } else {
                return loadCommit(options, self.recording[self.commitIndex])
                    .then(function () {
                        return {
                            type: 'commit',
                            commit: self.recording[self.commitIndex + 1].commitObject
                        };
                    })
                    .nodeify(callback);
            }
        };
    }

    return {
        _setUrl: _setUrl,
        addRecording: addRecording,
        Player: Player,
        getStatus: getCommitStatus,
        getCommitStatus: getCommitStatus,
        getBranchStatus: getBranchStatus,
        getRecordings: getRecordings
    };
});