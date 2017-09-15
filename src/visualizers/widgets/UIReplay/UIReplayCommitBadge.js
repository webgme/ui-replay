/*globals define, $*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'panels/UIReplay/UIReplayControllers',
    './UIReplayDialog',
    'css!./styles/UIReplay.css'
], function (RecordReplayControllers, UIReplayDialog) {
    'use strict';

    //var STATUS_CLASSES = 'loading success unavailable error';

    var UIReplayCommitBadge = function (containerEl, client, params) {
        var self = this,
            index = params.index;

        this._client = client;
        this._commitHash = params.id;

        if (typeof index === 'number') {
            // Add some margins just in case.
            this._n = index > 90 ? index + 20 : 100;
        } else {
            // Until webgme v2.18.0 look through 300 commits.
            this._n = 300;
        }

        this._destroyed = false;
        this.$el = $('<i>', {
            class: 'fa fa-video-camera ui-replay-commit-status-icon loading'
        });

        $(containerEl).append(this.$el);

        RecordReplayControllers.getStatus(client.getActiveProjectId(), this._commitHash, function (err, status) {
            if (self._destroyed) {
                return;
            }

            self.$el.removeClass('loading');

            if (err) {
                self.$el.addClass('error');
                self.$el.attr('title', 'Errored');
            } else if (status.exists === true) {
                self.$el.addClass('success');
                self.$el.attr('title', 'Start playback to current commit from this commit');
                self.$el.on('click', function () {
                    self._showReplayDialog();
                });
            } else {
                self.$el.addClass('unavailable');
                self.$el.attr('title', 'No recording available');
            }
        });
    };

    UIReplayCommitBadge.prototype._showReplayDialog = function () {
        (new UIReplayDialog(this.client)).show({
            client: this._client,
            startCommit: this._commitHash,
            endCommit: this._client.getActiveCommitHash(),
            n: this._n
        });
    };

    UIReplayCommitBadge.prototype.destroy = function () {
        this.$el.off('click');
        this._destroyed = true;
    };

    return UIReplayCommitBadge;
});