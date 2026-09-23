(function (global) {
  const REGISTRATION_CLOSED = true;
  // KST 2026-09-07 09:00 (used only when REGISTRATION_CLOSED is false)
  const REGISTRATION_OPEN_AT = Date.parse("2026-09-07T09:00:00+09:00");

  function isRegistrationOpen(now) {
    if (REGISTRATION_CLOSED) return false;
    return (now ?? Date.now()) >= REGISTRATION_OPEN_AT;
  }

  function isDomesticRegistrationOpen(now) {
    return isRegistrationOpen(now);
  }

  function isForeignerRegistrationOpen(now) {
    return isRegistrationOpen(now);
  }

  global.RegistrationSchedule = {
    REGISTRATION_CLOSED,
    REGISTRATION_OPEN_AT,
    DOMESTIC_OPEN_AT: REGISTRATION_OPEN_AT,
    isDomesticRegistrationOpen,
    isForeignerRegistrationOpen,
  };
})(typeof window !== "undefined" ? window : globalThis);
