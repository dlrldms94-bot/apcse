async function applyNetworkingCapacity(form, options) {
  const sessionInputs = form.querySelectorAll('input[name="sessionDates"]');
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
      const row = input.closest(".checkbox-row");
      let hint = row?.querySelector("[data-slot-full-hint]");

      if (slot?.full) {
        input.disabled = true;
        input.checked = false;
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
  const topicBlock = form.querySelector("[data-topic-block]");
  const submitBtn = form.querySelector("[type='submit']");
  const errorBox = form.querySelector("#errorBox");
  const sessionDateInputs = form.querySelectorAll('input[name="sessionDates"]');
  const topicFields = form.querySelectorAll("[data-topic-for]");

  function getSessionDates() {
    return [...form.querySelectorAll('input[name="sessionDates"]:checked')].map((el) => el.value);
  }

  function isBasicsComplete() {
    const name = form.querySelector('[name="name"]')?.value.trim();
    const affiliation = form.querySelector('[name="affiliation"]')?.value.trim();
    return Boolean(name && affiliation && getSessionDates().length);
  }

  function updateTopicFields() {
    const selected = new Set(getSessionDates());
    topicFields.forEach((field) => {
      const date = field.getAttribute("data-topic-for");
      const visible = selected.has(date);
      field.hidden = !visible;
      if (!visible) {
        const textarea = field.querySelector("textarea");
        if (textarea) textarea.value = "";
      }
    });
  }

  function updateTopicVisibility() {
    const show = isBasicsComplete();
    if (topicBlock) topicBlock.hidden = !show;
    if (show) updateTopicFields();
    if (submitBtn && !options.allSlotsFull) submitBtn.disabled = !show;
  }

  function getDiscussionTopics(dates) {
    const topics = {};
    for (const date of dates) {
      const textarea = form.querySelector(`[name="discussionTopic_${date}"]`);
      const value = textarea?.value.trim();
      if (value) topics[date] = value;
    }
    return topics;
  }

  form.querySelectorAll('[name="name"], [name="affiliation"]').forEach((input) => {
    input.addEventListener("input", updateTopicVisibility);
  });
  sessionDateInputs.forEach((input) => {
    input.addEventListener("change", () => {
      updateTopicVisibility();
      updateTopicFields();
    });
  });

  applyNetworkingCapacity(form, options).then((hasCapacity) => {
    options.allSlotsFull = !hasCapacity;
    updateTopicVisibility();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorBox) errorBox.hidden = true;

    const sessionDates = getSessionDates();
    if (!isBasicsComplete()) {
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
      const res = await fetch("/api/networking-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: options.type,
          name: form.querySelector('[name="name"]').value.trim(),
          affiliation: form.querySelector('[name="affiliation"]').value.trim(),
          sessionDates,
          discussionTopics: getDiscussionTopics(sessionDates),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (res.status === 403 && result.fullSessions?.length) {
          await applyNetworkingCapacity(form, options);
          updateTopicVisibility();
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
        submitBtn.disabled = options.allSlotsFull || !isBasicsComplete();
        submitBtn.textContent = options.messages.submitLabel;
      }
    }
  });
}
