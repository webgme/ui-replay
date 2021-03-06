/*jshint node: true*/
'use strict';

var config = require('./config.default');

config.server.port = 9001;
config.mongo.uri = 'mongodb://127.0.0.1:27017/webgme_ui_replay_tests';
config.authentication.enable = false;

config.rest.components.UIRecorder = {
    src: __dirname + '/../src/routers/UIRecorder/UIRecorder.js',
    mount: 'routers/UIRecorder',
    options: {
        mongo: {
            uri: 'mongodb://127.0.0.1:27017/webgme-ui-recording-data-test',
            options: {}
        }
    }
};

module.exports = config;