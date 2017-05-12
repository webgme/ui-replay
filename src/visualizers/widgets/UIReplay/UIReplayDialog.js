/*globals define, $, WebGMEGlobal*/
/*jshint browser: true*/

/**
 * Dialog for recording and replaying changes made to a project.
 *
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'js/logger',
    'panels/UIReplay/UIReplayControllers',
    'text!./templates/UIReplayDialog.html'
], function (Logger, RecordReplayControllers, dialogTemplate) {
    'use strict';

    var STATE_CHANGE_OPTIONS = {},
        COMMIT_CHANGE_OPTIONS = {};

    function UIReplayDialog(mainLogger) {
        this._logger = mainLogger ? mainLogger.fork('UIReplayDialog') : Logger.create(
            'gme:UIReplayDialog:UIReplayDialog',
            WebGMEGlobal.gmeConfig.client.log);

        this._dialog = null;
        this._dialogContent = null;
        this._footer = null;

        this._stepBackBtn = null;
        this._stepForwardBtn = null;
        this._recBadge = null;
        this._statusArea = null;
    }

    /**
     * Start the dialog, will load in the commits between start and end.
     * @param {object} options
     * @param {string} options.startCommit
     * @param {string} options.endCommit
     * @param {object} options.client
     * @param {function} [fnCallback]
     */
    UIReplayDialog.prototype.show = function (options, fnCallback) {
        var self = this;

        this._dialog = $(dialogTemplate);

        this._client = options.client;

        this._player = new RecordReplayControllers.Player(this._client);

        this._currentProjectId = this._client.getActiveProjectId();

        this._dialog.draggable({
            handle: '.modal-body'
        });

        this._dialogContent = this._dialog.find('.modal-dialog');

        this._stepBackBtn = this._dialog.find('.btn-step-back');
        this._stepForwardBtn = this._dialog.find('.btn-step-forward');

        this._footer = this._dialog.find('.modal-footer');
        this._recBadge = this._dialog.find('.rec-badge');
        this._detailsBtn = this._dialog.find('.toggle-details-btn');
        this._statusHeader = this._dialog.find('.status-header');
        this._statusArea = this._dialog.find('.status-area');
        this._statusArea.text('Loading recording data from server..');

        // Set events handlers
        this._stepForwardBtn.on('click', function () {
            self.atStep(true);
        });

        this._stepBackBtn.on('click', function () {
            self.atStep(false);
        });

        this._stepForwardBtn.prop('disabled', true);
        this._stepBackBtn.prop('disabled', true);

        // this._recBadge.on('click', function () {
        //     console.log('herro there');
        // });

        this._detailsBtn.on('click', function () {
            self._detailsBtn.removeClass('fa-minus fa-plus');

            if (self._footer.hasClass('hidden')) {
                self._dialogContent.width(400);
                self._footer.removeClass('hidden');
                self._detailsBtn.addClass('fa-minus');
            } else {
                self._dialogContent.width(180);
                self._footer.addClass('hidden');
                self._detailsBtn.addClass('fa-plus');
            }
        });

        this._dialog.on('hide.bs.modal', function () {
            self._dialog.remove();
            self._dialog = undefined;
            if (typeof fnCallback === 'function') {
                fnCallback();
            }
        });

        this._dialog.modal('show');

        this._player.loadRecordings(this._currentProjectId, options.startCommit, options.endCommit, 100,
            function (err) {
                if (err) {
                    self._logger.error(err);
                    self._statusArea.text('Error:' + err.message);
                } else {
                    self.setBadgeStatus();
                    self._stepForwardBtn.prop('disabled', false);
                    self._statusHeader.text('Record data and initial commit loaded');
                    self._statusArea.text('Start stepping forward ...');
                }
            }
        );
    };

    UIReplayDialog.prototype.atStep = function (forward) {
        var self = this,
            promise;

        this._stepForwardBtn.prop('disabled', true);
        this._stepBackBtn.prop('disabled', true);

        if (forward) {
            if (self._player.stateIndex === self._player.commitIndex) {
                promise = self._player.stepForwardState(STATE_CHANGE_OPTIONS);
            } else {
                promise = self._player.stepForwardCommit(COMMIT_CHANGE_OPTIONS);
            }
        } else {
            if (self._player.stateIndex === self._player.commitIndex) {
                promise = self._player.stepBackCommit(COMMIT_CHANGE_OPTIONS);
            } else {
                promise = self._player.stepBackState(STATE_CHANGE_OPTIONS);
            }
        }

        promise
            .then(function (data) {
                var message,
                    title;

                if (self._player.commitIndex < self._player.recording.length - 1) {
                    self._stepForwardBtn.prop('disabled', false);
                }

                if (self._player.stateIndex > 0) {
                    self._stepBackBtn.prop('disabled', false);
                }

                if (data.type === 'commit') {
                    message = data.commit.message;
                    if (forward) {
                        title = '"' + data.commit.updater[0] + '" made commit:';
                    } else {
                        title = 'Reverted commit';
                    }
                } else {
                    if (Object.keys(data.changedState).length === 0) {
                        if (forward === false && self._player.stateIndex === 0) {
                            title = 'Beginning reached';
                            message = 'Step forward...';
                            self._stepBackBtn.prop('disabled', true);
                        } else {
                            self.atStep(forward);
                        }
                    } else {
                        title = 'Loaded in changed UI state:';
                        message = JSON.stringify(data.changedState, null, 1);
                    }
                }

                self.setBadgeStatus();

                if (title && message) {
                    self._statusHeader.text(title);
                    self._statusArea.text(message);
                }
            })
            .catch(function (err) {
                self._logger.error(err);
                self._statusArea.text('Error:' + err.message);
            });
    };

    UIReplayDialog.prototype.setBadgeStatus = function () {
        this._recBadge.text((this._player.stateIndex + this._player.commitIndex + 2) + ' / ' +
            this._player.recording.length * 2);
    };

    return UIReplayDialog;
});
