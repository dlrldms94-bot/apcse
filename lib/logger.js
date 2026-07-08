const { pool } = require("./db");

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const sanitized = { ...payload };
  ["password", "passwordConfirm", "password_hash"].forEach((key) => {
    if (key in sanitized) sanitized[key] = "[REDACTED]";
  });
  return sanitized;
}

function getRequestMeta(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ipAddress =
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null) ||
    req.headers["x-real-ip"] ||
    req.ip ||
    "unknown";
  return {
    ipAddress,
    userAgent: req.headers["user-agent"] || "unknown",
  };
}

function writeStdout(level, entry) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "apcse",
    level,
    ...entry,
  });
  if (level === "error") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

async function serverLog(input) {
  const level =
    input.status === "FAILURE" || (input.statusCode || 0) >= 500
      ? "error"
      : "info";

  writeStdout(level, {
    event: input.event,
    category: input.category,
    status: input.status,
    registrationType: input.registrationType,
    registrationId: input.registrationId,
    applicantName: input.applicantName,
    contact: input.contact,
    errorMessage: input.errorMessage,
    statusCode: input.statusCode,
    ipAddress: input.ipAddress,
    metadata: input.metadata,
  });

  try {
    await pool.query(
      `INSERT INTO activity_logs (
        event, category, status, registration_type, registration_id,
        applicant_name, contact, error_message, status_code,
        ip_address, user_agent, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        input.event,
        input.category,
        input.status,
        input.registrationType || null,
        input.registrationId || null,
        input.applicantName || null,
        input.contact || null,
        input.errorMessage || null,
        input.statusCode || null,
        input.ipAddress || null,
        input.userAgent || null,
        input.metadata || null,
      ],
    );
  } catch (error) {
    writeStdout("error", {
      event: "logging.persist_failure",
      errorMessage: error.message,
    });
  }
}

module.exports = { serverLog, getRequestMeta, sanitizePayload };
