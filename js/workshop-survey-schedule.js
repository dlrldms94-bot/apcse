(function (global) {
  const WORKSHOP_SURVEY_CLOSED = true;

  function isDomesticWorkshopSurveyOpen() {
    return !WORKSHOP_SURVEY_CLOSED;
  }

  function isForeignerWorkshopSurveyOpen() {
    return !WORKSHOP_SURVEY_CLOSED;
  }

  global.WorkshopSurveySchedule = {
    WORKSHOP_SURVEY_CLOSED,
    isDomesticWorkshopSurveyOpen,
    isForeignerWorkshopSurveyOpen,
  };
})(typeof window !== "undefined" ? window : globalThis);
