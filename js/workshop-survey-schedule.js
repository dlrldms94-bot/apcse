(function (global) {
  // KST 2026-10-06 15:00
  const WORKSHOP_SURVEY_OPEN_AT = Date.parse("2026-10-06T15:00:00+09:00");

  function isWorkshopSurveyOpen(now) {
    return (now ?? Date.now()) >= WORKSHOP_SURVEY_OPEN_AT;
  }

  function isDomesticWorkshopSurveyOpen(now) {
    return isWorkshopSurveyOpen(now);
  }

  function isForeignerWorkshopSurveyOpen(now) {
    return isWorkshopSurveyOpen(now);
  }

  global.WorkshopSurveySchedule = {
    WORKSHOP_SURVEY_OPEN_AT,
    get WORKSHOP_SURVEY_CLOSED() {
      return !isWorkshopSurveyOpen();
    },
    isWorkshopSurveyOpen,
    isDomesticWorkshopSurveyOpen,
    isForeignerWorkshopSurveyOpen,
  };
})(typeof window !== "undefined" ? window : globalThis);
