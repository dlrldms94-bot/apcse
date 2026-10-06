(function (global) {
  // KST 2026-10-06 15:00
  const NETWORKING_SURVEY_OPEN_AT = Date.parse("2026-10-06T15:00:00+09:00");

  function isNetworkingSurveyOpen(now) {
    return (now ?? Date.now()) >= NETWORKING_SURVEY_OPEN_AT;
  }

  function isDomesticNetworkingSurveyOpen(now) {
    return isNetworkingSurveyOpen(now);
  }

  function isForeignerNetworkingSurveyOpen(now) {
    return isNetworkingSurveyOpen(now);
  }

  global.NetworkingSurveySchedule = {
    NETWORKING_SURVEY_OPEN_AT,
    get NETWORKING_SURVEY_CLOSED() {
      return !isNetworkingSurveyOpen();
    },
    isNetworkingSurveyOpen,
    isDomesticNetworkingSurveyOpen,
    isForeignerNetworkingSurveyOpen,
  };
})(typeof window !== "undefined" ? window : globalThis);
