/*
 *  Copyright (C) GPayments Pty Ltd - All Rights Reserved
 *  Copying of this file, via any medium, is subject to the
 *  ActiveServer End User License Agreement (EULA)
 *
 *  Proprietary code for use in conjunction with GPayments products only
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 *  Written by GPayments <techsupport@gpayments.com>, 2019
 *
 *
 */

/**
 3DS Server trans Id.
 **/
var serverTransId;

/**
 * Callback function for 3ds-web-adapter.
 * This function should be implemented by merchant side to handle callback from 3ds-web-adapter.
 * Two parameters expected: type and data.
 * @param type. Indicate the type of event. Values accepted:
 *                    onAuthResult: indicate an auth result
 *                    on3RIResult: indicate an 3ri result
 *                    onEnrolResult: indicate an enrol result
 *                    onChallengeStart: indicate to start a challenge
 *                    onError: indicate an error
 * @param data. The data returned from 3ds-web-adapter. Data contains either the result of 'auth', '3ri', 'enrol', or the error message.
 */
var _callbackFn;

/**
 * iframe container
 */
var iframeContainer;

/**
 * iframe id, it is a random number of 6 digits
 */
var iframeId;

/**
 * Perform Browser-based authentication
 * @param authData
 * @param messageCategory
 * @param container: iframe container
 * @param callbackFn: callback function to return data
 */
function brw(authData, container, callbackFn, messageCategory) {

  _callbackFn = callbackFn;
  iframeContainer = container;
  //generate an random number for iframe Id
  iframeId = String(Math.floor(100000 + Math.random() * 900000));

  //3DS Requestor url for Initialise Authentication
  var initAuthUrl;
  if (messageCategory) {
    if (messageCategory === "pa" || messageCategory === "npa") {
      initAuthUrl = "/auth/init/" + messageCategory;
    } else {
      _callbackFn("onError", {"Error": "Invalid messageCategory"});
    }
  } else {
    initAuthUrl = "/auth/init/" + "pa";
  }

  console.log('init authentication', authData);

  //Send data to /auth/init/{messageCategory} to do Initialise authentication (Step 2)
  doPost(initAuthUrl, authData, _onInitAuthSuccess);
}

/**
 * Send data to url /auth/3ri to do 3RI
 * @param authData
 * @param callbackFn
 */
function threeRI(authData, callbackFn) {
  _callbackFn = callbackFn;
  console.log('3ri: ', authData);
  doPost("/auth/3ri", authData, _on3RISuccess);
}

/**
 * Send data to url /auth/enrol to do enrol
 * @param authData
 * @param callbackFn
 */
function enrol(authData, callbackFn) {
  _callbackFn = callbackFn;
  console.log('enrol: ', authData);
  doPost("/auth/enrol", authData, _onEnrolSuccess);
}

/**
 * Get the authentication from Active Server
 * @param threeDSServerTransID
 * @param callbackFn
 */
function result(threeDSServerTransID, callbackFn) {
  getResult(threeDSServerTransID, callbackFn);
}

/**
 * Post authData to 3ds requestor with url
 * @param url
 * @param authData
 * @param onSuccess
 */
function doPost(url, authData, onSuccess) {
  $.ajax({
    url: url,
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify(authData),
    dataType: 'json',
    success: function (data) {
      onSuccess(data);
    },
    error: function (error) {
      _callbackFn("onError", error.responseJSON);
    }
  });
}

/**
 * callback function for brw
 * @param data
 * @private
 */
function _onInitAuthSuccess(data) {
  console.log('init auth returns:', data);

  if (data.threeDSServerCallbackUrl) {

    serverTransId = data.threeDSServerTransID;
    $('<iframe id="' + "3ds_" + iframeId
        + '" width="0" height="0" style="visibility: hidden;" src="'
        + data.threeDSServerCallbackUrl + '"></iframe>')
        .appendTo(iframeContainer);

  } else {
    _callbackFn("onError", data);
  }

  if (data.monUrl) {
      // optionally append the monitoring iframe
    $('<iframe id="' + "mon_" + iframeId
        + '" width="0" height="0" style="visibility: hidden;" src="'
        + data.monUrl + '"></iframe>')
    .appendTo(iframeContainer);

  }
}

/**
 * Send data to url /auth to Execute authentication (Step 9)
 * @param transId
 * @private
 */
function _doAuth(transId) {

  console.log('Do Authentication for transId', transId);

  //first remove any 3dsmethod iframe
  $("#3ds_" + iframeId).remove();
  var authData = {};
  authData.threeDSRequestorTransID = transId;
  authData.threeDSServerTransID = serverTransId;

  doPost("/auth", authData, _onDoAuthSuccess);
}

/**
 * callback function for _doAuth
 * @param data
 * @private
 */
function _onDoAuthSuccess(data) {
  console.log('auth returns:', data);

  if (data.transStatus) {
    if (data.transStatus === "C") {
      // 3D requestor can decide whether to proceed the challenge here
      data.challengeUrl ? startChallenge(data.challengeUrl) : _callbackFn(
          "onError", {"Error": "Invalid Challenge Callback Url"});
    } else {
      _callbackFn("onAuthResult", data);
    }
  } else {
    _callbackFn("onError", data);
  }
}

/**
 * Setup iframe for challenge flow (Step 14(C))
 * @param url is the challenge url returned from 3DS Server
 */
function startChallenge(url) {

  _callbackFn("onChallengeStart");
  //create the iframe
  $('<iframe src="' + url
      + '" width="100%" height="100%" style="border:0" id="' + "cha_" + iframeId
      + '"></iframe>')
  .appendTo(iframeContainer);

}

/**
 Default _callbackFn method for challenge flow. 3DS Server will call this method to get auth result when the challenge finish
 **/
function _onAuthResult() {
  console.log('authentication result is ready: ');
  getResult(serverTransId, _callbackFn);
}

/**
 * Method to get authentication result
 * @param threeDSServerTransID
 * @param callbackFn
 */
function getResult(threeDSServerTransID, callbackFn) {
  console.log("Get authentication result for threeDSServerTransID: ",
      threeDSServerTransID);
  $.get("/auth/result", {txid: threeDSServerTransID})
  .done(function (data) {
    console.log('returns:', data);
    if (data.transStatus) {
      callbackFn("onAuthResult", data);
    } else {
      callbackFn("onError", data);
    }
  })
  .fail(function (error) {
    callbackFn("onError", error.responseJSON);
  });
}

/**
 Default _callbackFn method for 3DSMethod Skipped Event.
 **/
function _on3DSMethodSkipped(transId) {

  console.log('3DS Method is skipped or not presented, now calling doInitAuth.',
      transId);

  _doAuth(transId);
}

/**
 Default _callbackFn method for 3DSMethod Finished Event.
 **/
function _on3DSMethodFinished(transId) {

  console.log('now calling _doAuth. transId=', transId);

  _doAuth(transId);
}

/**
 * Default _callbackFn method for InitAuthTimeout event .
 */
function _onInitAuthTimedOut(transId) {
  console.log('Init Auth has timed out due to 3DS method timing out or browser '
      + 'information collecting failed'
      + ' now terminating the authentication process. transId=', transId);

  _callbackFn("onError", {"Error": "InitAuth timeout"});
}

/**
 * callback function for threeRI()
 * @param data
 * @private
 */
function _on3RISuccess(data) {
  console.log('returns:', data);
  if (data.transStatus) {
    _callbackFn("on3RIResult", data);
  } else {
    _callbackFn("onError", data);
  }
}

/**
 * callback function for enrol()
 * @param data
 * @private
 */
function _onEnrolSuccess(data) {
  console.log('returns:', data);
  if (data.enrolmentStatus) {
    _callbackFn("onEnrolResult", data);
  } else {
    _callbackFn("onError", data);
  }
}

