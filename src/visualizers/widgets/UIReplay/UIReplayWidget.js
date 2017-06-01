/*globals define, WebGMEGlobal*/
/*jshint browser: true*/

/**
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'js/logger',
    'js/Controls/DropDownMenu',
    'js/Controls/PopoverBox',
    'js/Dialogs/ProjectRepository/ProjectRepositoryDialog',
    './UIReplayDialog',
    'panels/UIReplay/UIReplayControllers',
    'css!./styles/UIReplay.css'
], function (Logger, DropDownMenu, PopoverBox, ProjectRepositoryDialog, UIReplayDialog, RecordReplayControllers) {

    'use strict';

    var DELAY = 1000;

    function UIReplayWidget(containerEl, client) {
        this._logger = Logger.create('gme:Widgets:UIReplayWidget', WebGMEGlobal.gmeConfig.client.log);

        this._client = client;
        this._el = containerEl;

        this._commitHash = null;
        this._timeoutId = null;

        this._initialize();

        this._logger.debug('Created');
    }

    UIReplayWidget.prototype._initialize = function () {
        var self = this;
        this._el.addClass('record-replay-widget');

        this._dropDown = new DropDownMenu({
            dropUp: true,
            pullRight: true,
            size: 'micro',
            sort: true,
            icon: 'fa fa-video-camera record-icon'
        });

        this._dropDown.setTitle('');
        this._dropDown.setColor(DropDownMenu.prototype.COLORS.LIGHT_BLUE);
        this._popoverBox = new PopoverBox(this._dropDown.getEl());

        self._el.addClass('recording');

        this._el.append(this._dropDown.getEl());

        this._onBranchOpen = function (_client, branchName) {
            clearTimeout(self._timeoutId);
            self._commitHash = null;
            self._popoverBox.hide();
            if (branchName) {
                setTimeout(function () {
                    if (branchName === self._client.getActiveBranchName() && self._client.getActiveProjectId()) {
                        RecordReplayControllers.getBranchStatus(self._client.getActiveProjectId(), branchName)
                            .then(function (status) {
                                if (status.commitIndex !== 0 && status.totalEntries > 0) {
                                    if (status.commitHash) {
                                        self._popoverBox.show('There are ' + (status.commitIndex) +
                                            ' changes since your last one.',
                                            self._popoverBox.alertLevels.info, DELAY * 4);
                                        self._commitHash = status.commitHash;
                                    } else {
                                        self._popoverBox.show('There are more than ' + (status.totalEntries) +
                                            ' changes since your last one.',
                                            self._popoverBox.alertLevels.info, DELAY * 4);
                                    }
                                }
                            })
                            .catch(function (err) {
                                self._logger.error(err);
                            });
                    }
                }, DELAY);
            }
        };

        this._onNewCommit = function (_client, cData) {
            self._commitHash = null;
            RecordReplayControllers.addRecording(cData, function (err) {
                if (err) {
                    self._logger.error(err);
                }
            });
        };

        if (this._client.gmeConfig.authentication.enable === true) {
            this._client.addEventListener(this._client.CONSTANTS.BRANCH_CHANGED, this._onBranchOpen);
        }

        this._client.addEventListener(this._client.CONSTANTS.NEW_COMMIT_STATE, this._onNewCommit);

        this._dropDown.onDropDownMenuOpen = function () {
            var dialog;
            self._popoverBox.hide();

            if (self._commitHash) {
                dialog = new UIReplayDialog(self._logger);
                dialog.show({
                    client: self._client,
                    startCommit: self._commitHash,
                    endCommit: self._client.getActiveCommitHash()
                });
            } else if (self._client.getActiveProjectName()) {
                dialog = new ProjectRepositoryDialog(self._client);
                dialog.show({
                    branches: [],
                    start: self._client.getActiveBranchName()
                });
            } else {
                self._client.notifyUser({
                    message: 'No project is open - can\'t initiate playback',
                    severity: 'warning'
                });
            }
        };
    };

    UIReplayWidget.prototype.destroy = function () {
        clearTimeout(this._timeoutId);
        if (this._client.gmeConfig.authentication.enable === true) {
            this._client.removeEventListener(this._client.CONSTANTS.BRANCH_CHANGED, this._onBranchOpen);
        }
        this._client.removeEventListener(this._client.CONSTANTS.NEW_COMMIT_STATE, this._onNewCommit);
    };

    return UIReplayWidget;
});