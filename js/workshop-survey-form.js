function renderWorkshopSessionCheckboxes(container, lang, slotFullHint) {
  if (!container || typeof WorkshopSessions === "undefined") return;
  const variant = lang === "en" ? "labelEn" : "labelKo";
  container.innerHTML = WorkshopSessions.WORKSHOP_SESSIONS.map(
    (session) => `
      <label class="checkbox-row workshop-session-row">
        <input type="checkbox" name="workshopSessionIds" value="${session.id}">
        <span>${session[variant]}<br><span class="hint" data-slot-full-hint hidden>${slotFullHint}</span></span>
      </label>
    `,
  ).join("");
}

async function applyWorkshopCapacity(form, options) {
  const sessionInputs = form.querySelectorAll('input[name="workshopSessionIds"]');
  const submitBtn = form.querySelector("[type='submit']");
  const errorBox = form.querySelector("#errorBox");

  try {
    const res = await fetch("/api/workshop-survey/capacity");
    const data = await res.json();
    if (!res.ok) return true;

    const slots = data.slots?.[options.type] || {};
    options.capacitySlots = slots;
    options.capacityLimit = data.capacity?.[options.type];

    let enabledCount = 0;
    sessionInputs.forEach((input) => {
      const slot = slots[input.value];
      const row = input.closest(".checkbox-row");
      let hint = row?.querySelector("[data-slot-full-hint]");

      if (slot?.full) {
        input.disabled = true;
        if (input.checked) input.checked = false;
        if (row) row.classList.add("checkbox-disabled");
        if (hint) hint.hidden = false;
      } else {
        input.disabled = false;
        if (row) row.classList.remove("checkbox-disabled");
        if (hint) hint.hidden = true;
        enabledCount += 1;
      }
    });

    if (!enabledCount) {
      if (errorBox) {
        errorBox.textContent = options.messages.allSlotsFull;
        errorBox.hidden = false;
      }
      if (submitBtn) submitBtn.disabled = true;
      options.allSlotsFull = true;
      return false;
    }

    options.allSlotsFull = false;
    return true;
  } catch {
    return true;
  }
}

function initWorkshopSurveyForm(form, options) {
  const sessionsContainer = form.querySelector("[data-workshop-sessions]");
  const submitBtn = form.querySelector("[type='submit']");
  const errorBox = form.querySelector("#errorBox");

  renderWorkshopSessionCheckboxes(
    sessionsContainer,
    options.lang || "ko",
    options.messages.slotFullHint || "",
  );

  function getSelectedSessionIds() {
    return [...form.querySelectorAll('input[name="workshopSessionIds"]:checked')].map((el) => el.value);
  }

  function isFormComplete() {
    const name = form.querySelector('[name="name"]')?.value.trim();
    const affiliation = form.querySelector('[name="affiliation"]')?.value.trim();
    return Boolean(name && affiliation && getSelectedSessionIds().length);
  }

  function updateSubmitState() {
    if (submitBtn && !options.allSlotsFull) {
      submitBtn.disabled = !isFormComplete();
    }
  }

  form.querySelectorAll('[name="name"], [name="affiliation"]').forEach((input) => {
    input.addEventListener("input", updateSubmitState);
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="workshopSessionIds"]')) {
      updateSubmitState();
    }
  });

  applyWorkshopCapacity(form, options).then(() => {
    updateSubmitState();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorBox) errorBox.hidden = true;

    const workshopSessionIds = getSelectedSessionIds();
    if (!isFormComplete()) {
      if (errorBox) {
        errorBox.textContent = options.messages.basicsRequired;
        errorBox.hidden = false;
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = options.messages.submitting;
    }

    try {
      const res = await fetch("/api/workshop-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: options.type,
          name: form.querySelector('[name="name"]').value.trim(),
          affiliation: form.querySelector('[name="affiliation"]').value.trim(),
          workshopSessionIds,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (res.status === 403 && result.fullSessions?.length) {
          await applyWorkshopCapacity(form, options);
          updateSubmitState();
        }
        throw new Error(result.error || options.messages.failure);
      }
      location.href = options.completeUrl;
    } catch (error) {
      if (errorBox) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      }
      if (submitBtn) {
        submitBtn.disabled = options.allSlotsFull || !isFormComplete();
        submitBtn.textContent = options.messages.submitLabel;
      }
    }
  });
}
