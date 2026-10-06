function renderModeratorTopicCheckboxes(container, lang) {
  if (!container || typeof NetworkingSurveyTopics === "undefined") return;
  const variant = lang === "en" ? "en" : "ko";
  const circled = ["①", "②", "③", "④", "⑤", "⑥"];
  container.innerHTML = NetworkingSurveyTopics.NETWORKING_TOPICS.map((topic) => {
    const prefix = circled[topic.id - 1] || `${topic.id}.`;
    const label = topic.moderator[variant];
    return `
      <label class="checkbox-row networking-moderator-topic-row">
        <input type="checkbox" name="moderatorTopicIds" value="${topic.id}">
        <span><strong>${prefix}</strong> ${label}</span>
      </label>
    `;
  }).join("");
}

async function applyNetworkingCapacity(form, options) {
  const sessionInputs = form.querySelectorAll('input[name="sessionDate"]');
  const submitBtn = form.querySelector("[type='submit']");
  const errorBox = form.querySelector("#errorBox");

  try {
    const res = await fetch("/api/networking-survey/capacity");
    const data = await res.json();
    if (!res.ok) return;

    const slots = data.slots?.[options.type] || {};
    options.capacitySlots = slots;

    let enabledCount = 0;
    sessionInputs.forEach((input) => {
      const slot = slots[input.value];
      const row = input.closest(".radio-row");
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
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

function initNetworkingSurveyForm(form, options) {
  const followupBlock = form.querySelector("[data-followup-block]");
  const moderatorTopicsBlock = form.querySelector("[data-moderator-topics-block]");
  const moderatorTopicsContainer = form.querySelector("[data-moderator-topics]");
  const submitBtn = form.querySelector("[type='submit']");
  const errorBox = form.querySelector("#errorBox");
  const sessionDateInputs = form.querySelectorAll('input[name="sessionDate"]');
  const moderatorInterestInputs = form.querySelectorAll('input[name="moderatorInterest"]');

  renderModeratorTopicCheckboxes(moderatorTopicsContainer, options.lang || "ko");

  function getSessionDate() {
    const selected = form.querySelector('input[name="sessionDate"]:checked');
    return selected?.value || "";
  }

  function getSessionDates() {
    const date = getSessionDate();
    return date ? [date] : [];
  }

  function getModeratorInterest() {
    const selected = form.querySelector('input[name="moderatorInterest"]:checked');
    if (!selected) return null;
    return selected.value === "yes";
  }

  function getModeratorTopicIds() {
    return [...form.querySelectorAll('input[name="moderatorTopicIds"]:checked')].map((el) =>
      Number(el.value),
    );
  }

  function clearModeratorTopicSelections() {
    form.querySelectorAll('input[name="moderatorTopicIds"]').forEach((input) => {
      input.checked = false;
    });
  }

  function updateModeratorTopicsVisibility() {
    const interest = getModeratorInterest();
    const showTopics = interest === true;
    if (moderatorTopicsBlock) moderatorTopicsBlock.hidden = !showTopics;
    if (!showTopics) clearModeratorTopicSelections();
  }

  function updateFollowupVisibility() {
    const hasDate = Boolean(getSessionDate());
    if (followupBlock) followupBlock.hidden = !hasDate;
    if (!hasDate) {
      moderatorInterestInputs.forEach((input) => {
        input.checked = false;
      });
      updateModeratorTopicsVisibility();
    }
  }

  function isFormComplete() {
    const name = form.querySelector('[name="name"]')?.value.trim();
    const affiliation = form.querySelector('[name="affiliation"]')?.value.trim();
    const phone = form.querySelector('[name="phone"]')?.value.trim();
    const email = form.querySelector('[name="email"]')?.value.trim();
    const sessionDate = getSessionDate();
    const moderatorInterest = getModeratorInterest();
    if (!name || !affiliation || !phone || !email || !sessionDate || moderatorInterest === null) {
      return false;
    }
    if (moderatorInterest && !getModeratorTopicIds().length) {
      return false;
    }
    return true;
  }

  function updateSubmitState() {
    if (submitBtn && !options.allSlotsFull) {
      submitBtn.disabled = !isFormComplete();
    }
  }

  function handleFormChange() {
    updateFollowupVisibility();
    updateModeratorTopicsVisibility();
    updateSubmitState();
  }

  form.querySelectorAll('[name="name"], [name="affiliation"], [name="phone"], [name="email"]').forEach((input) => {
    input.addEventListener("input", handleFormChange);
  });
  sessionDateInputs.forEach((input) => {
    input.addEventListener("change", handleFormChange);
  });
  moderatorInterestInputs.forEach((input) => {
    input.addEventListener("change", handleFormChange);
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="moderatorTopicIds"]')) {
      updateSubmitState();
    }
  });

  applyNetworkingCapacity(form, options).then((hasCapacity) => {
    options.allSlotsFull = !hasCapacity;
    handleFormChange();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorBox) errorBox.hidden = true;

    const sessionDates = getSessionDates();
    const moderatorInterest = getModeratorInterest();
    const moderatorTopicIds = getModeratorTopicIds();

    if (
      !form.querySelector('[name="name"]')?.value.trim() ||
      !form.querySelector('[name="affiliation"]')?.value.trim() ||
      !form.querySelector('[name="phone"]')?.value.trim() ||
      !form.querySelector('[name="email"]')?.value.trim() ||
      !sessionDates.length ||
      moderatorInterest === null
    ) {
      if (errorBox) {
        errorBox.textContent = options.messages.basicsRequired;
        errorBox.hidden = false;
      }
      return;
    }

    if (moderatorInterest && !moderatorTopicIds.length) {
      if (errorBox) {
        errorBox.textContent = options.messages.moderatorTopicsRequired;
        errorBox.hidden = false;
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = options.messages.submitting;
    }

    try {
      const res = await fetch("/api/networking-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: options.type,
          name: form.querySelector('[name="name"]').value.trim(),
          affiliation: form.querySelector('[name="affiliation"]').value.trim(),
          phone: form.querySelector('[name="phone"]').value.trim(),
          email: form.querySelector('[name="email"]').value.trim(),
          sessionDates,
          moderatorInterest,
          moderatorTopicIds: moderatorInterest ? moderatorTopicIds : [],
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (res.status === 403 && result.fullSessions?.length) {
          await applyNetworkingCapacity(form, options);
          handleFormChange();
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
