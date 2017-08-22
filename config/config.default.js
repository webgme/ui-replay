'use strict';

var config = require('./config.webgme'),
    validateConfig = require('webgme/config/validator');

// Add/overwrite any additional settings here
// config.server.port = 8080;
// config.mongo.uri = 'mongodb://127.0.0.1:27017/webgme_my_app';

config.authentication.enable = true;

config.rest.components.UIRecorder = {
    src: __dirname + '/../src/routers/UIRecorder/UIRecorder.js',
    mount: 'routers/UIRecorder',
    options: {
        mongo: {
            uri: 'mongodb://127.0.0.1:27017/webgme-ui-recording-data',
            options: {}
        }
    }
};

validateConfig(config);
module.exports = config;