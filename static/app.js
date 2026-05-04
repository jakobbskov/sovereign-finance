(() => {
  const elements = {
    form: document.getElementById("decisionForm"),
    decisions: document.getElementById("decisions"),
    message: document.getElementById("message"),
  };

  function setMessage(text, isError = false) {
    elements.message.textContent = text;
    elements.message.className = isError ? "error" : "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderDecisions(decisions) {
    if (!decisions.length) {
      elements.decisions.innerHTML = "<p>Ingen beslutninger gemt endnu.</p>";
      return;
    }

    elements.decisions.innerHTML = decisions
      .slice()
      .reverse()
      .map((item) => {
        const amount = item.amountDkk ? `${item.amountDkk} kr.` : "Intet beløb";
        const tags = Array.isArray(item.tags) && item.tags.length ? item.tags.join(", ") : "ingen tags";

        return `
          <article class="decision">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.decision)}</p>
            <p class="meta">
              ${escapeHtml(item.status)} · ${escapeHtml(amount)} · ${escapeHtml(tags)} · ${escapeHtml(item.createdAt)}
            </p>
            ${item.rationale ? `<p><strong>Begrundelse:</strong> ${escapeHtml(item.rationale)}</p>` : ""}
          </article>
        `;
      })
      .join("");
  }

  async function loadDecisions() {
    const response = await fetch("/api/decisions");

    if (!response.ok) {
      throw new Error(`Kunne ikke hente beslutninger: ${response.status}`);
    }

    const data = await response.json();
    renderDecisions(data.decisions || []);
  }

  async function handleDecisionSubmit(event) {
    event.preventDefault();
    setMessage("");

    const formData = new FormData(elements.form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Beslutningen kunne ikke gemmes.", true);
        return;
      }

      elements.form.reset();
      setMessage("Beslutning gemt.");
      await loadDecisions();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  elements.form.addEventListener("submit", handleDecisionSubmit);
  loadDecisions().catch((error) => setMessage(error.message, true));
})();
