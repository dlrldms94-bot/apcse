(function (global) {
  const NETWORKING_SURVEY_CLOSED = true;

  function isDomesticNetworkingSurveyOpen() {
    return !NETWORKING_SURVEY_CLOSED;
  }

  function isForeignerNetworkingSurveyOpen() {
    return !NETWORKING_SURVEY_CLOSED;
  }

  global.NetworkingSurveySchedule = {
    NETWORKING_SURVEY_CLOSED,
    isDomesticNetworkingSurveyOpen,
    isForeignerNetworkingSurveyOpen,
  };
})(typeof window !== "undefined" ? window : globalThis);
