(function (global) {
  // KST 2026-09-07 09:00
  const REGISTRATION_OPEN_AT = Date.parse("2026-09-07T09:00:00+09:00");

  function isRegistrationOpen(now) {
    return (now ?? Date.now()) >= REGISTRATION_OPEN_AT;
  }

  function isDomesticRegistrationOpen(now) {
    return isRegistrationOpen(now);
  }

  function isForeignerRegistrationOpen(now) {
    return isRegistrationOpen(now);
  }

  global.RegistrationSchedule = {
    REGISTRATION_OPEN_AT,
    DOMESTIC_OPEN_AT: REGISTRATION_OPEN_AT,
    isDomesticRegistrationOpen,
    isForeignerRegistrationOpen,
  };
})(typeof window !== "undefined" ? window : globalThis);
