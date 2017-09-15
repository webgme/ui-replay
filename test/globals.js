// This is used by the test/plugins tests
/*globals requireJS*/
/*jshint node:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

'use strict';

var testFixture = require('webgme/test/_globals'),
    WEBGME_CONFIG_PATH = '../config',
    path = require('path');

requireJS.config({
    paths: {
        'js/Constants': path.join(__dirname, '../node_modules/webgme/src/client/js/Constants')
    }
});

global.WebGMEGlobal = {};

// This flag will make sure the config.test.js is being used
// process.env.NODE_ENV = 'test'; // This is set by the require above, overwrite it here.

var WebGME = testFixture.WebGME,
    gmeConfig = require(WEBGME_CONFIG_PATH),
    getGmeConfig = function getGmeConfig() {
        // makes sure that for each request it returns with a unique object and tests will not interfere
        if (!gmeConfig) {
            // if some tests are deleting or unloading the config
            gmeConfig = require(WEBGME_CONFIG_PATH);
        }

        global.WebGMEGlobal.gmeConfig = JSON.parse(JSON.stringify(gmeConfig));
        return global.WebGMEGlobal.gmeConfig;
    };

WebGME.addToRequireJsPaths(gmeConfig);

testFixture.getGmeConfig = getGmeConfig;

module.exports = testFixture;