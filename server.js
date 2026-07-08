require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const { pool, initDatabase } = require("./lib/db");
const { hashPassword, verifyPassword } = require("./lib/password");
const { serverLog, getRequestMeta, sanitizePayload } = require("./lib/logger");
const { createPayPalOrder, capturePayPalOrder } = require("./lib/paypal");

const ROOT_DIR = __dirname;
const HTML_PAGES = [
  "index.html",
  "register-domestic.html",
  "register-foreigner.html",
  "payment.html",
  "register-complete.html",
  "mypage.html",
  "mypage-edit.html",
  "admin-logs.html",
  "preview.html",
];

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "apcse2026!";
const SESSION_COOKIE = "apcse_session";
const REGISTRATION_FEE = {
  amount: Number(process.env.REGISTRATION_FEE_AMOUNT || 100),
  currency: process.env.REGISTRATION_FEE_CURRENCY || "USD",
};

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser(process.env.SESSION_SECRET || "apcse-dev-secret"));
app.use("/css", express.static(path.join(ROOT_DIR, "css")));

function sendHtmlPage(res, filename) {
  const filePath = path.join(ROOT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not Found");
  }
  return res.sendFile(filePath);
}

HTML_PAGES.forEach((filename) => {
  const route = filename === "index.html" ? "/" : `/${filename}`;
  app.get(route, (req, res) => sendHtmlPage(res, filename));
  if (filename === "index.html") {
    app.get("/index.html", (req, res) => sendHtmlPage(res, filename));
  }
});

app.use(express.static(ROOT_DIR));

function getSessionRegistrationId(req) {
  const signed = req.signedCookies[SESSION_COOKIE];
  return typeof signed === "string" ? signed : null;
}

function setSession(res, registrationId) {
  res.cookie(SESSION_COOKIE, registrationId, {
    httpOnly: true,
    signed: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 2 * 60 * 60 * 1000,
  });
}

function clearSession(res) {
  res.clearCookie(SESSION_COOKIE);
}

function verifyAdmin(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
}

function serializeRegistration(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    title: row.title,
    affiliation: row.affiliation,
    contact: row.contact,
    privacyConsent: row.privacy_consent,
    nationality: row.nationality,
    passportNumber: row.passport_number,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    dietary: row.dietary,
    accommodation: row.accommodation,
    accommodationDays: row.accommodation_days,
    vehicleUsage: row.vehicle_usage,
    specialRequests: row.special_requests,
    paymentStatus: row.payment_status,
    amount: row.amount,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (req, res) => {
  res.json({
    paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
    registrationFee: REGISTRATION_FEE,
  });
});

app.post("/api/register/domestic", async (req, res) => {
  const { ipAddress, userAgent } = getRequestMeta(req);
  const body = req.body || {};

  await serverLog({
    event: "registration.domestic.attempt",
    category: "REGISTRATION",
    status: "ATTEMPT",
    registrationType: "DOMESTIC",
    applicantName: body.name,
    contact: body.contact,
    ipAddress,
    userAgent,
    metadata: { payload: sanitizePayload(body) },
  });

  const { name, title, affiliation, contact, privacyConsent, password } = body;

  if (!name || !title || !affiliation || !contact || !password) {
    const errorMessage = "필수 항목을 모두 입력해주세요.";
    await serverLog({
      event: "registration.domestic.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "DOMESTIC",
      applicantName: name,
      contact,
      errorMessage,
      statusCode: 400,
      ipAddress,
      userAgent,
      metadata: { payload: sanitizePayload(body) },
    });
    return res.status(400).json({ error: errorMessage });
  }

  if (String(password).length < 4) {
    const errorMessage = "비밀번호는 4자 이상이어야 합니다.";
    await serverLog({
      event: "registration.domestic.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "DOMESTIC",
      applicantName: name,
      contact,
      errorMessage,
      statusCode: 400,
      ipAddress,
      userAgent,
    });
    return res.status(400).json({ error: errorMessage });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO registrations (
        type, name, title, affiliation, contact, privacy_consent, password_hash, payment_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'NOT_REQUIRED')
      RETURNING *`,
      [
        "DOMESTIC",
        name,
        title,
        affiliation,
        contact,
        Boolean(privacyConsent),
        passwordHash,
      ],
    );
    const registration = result.rows[0];

    await serverLog({
      event: "registration.domestic.success",
      category: "REGISTRATION",
      status: "SUCCESS",
      registrationType: "DOMESTIC",
      registrationId: registration.id,
      applicantName: registration.name,
      contact: registration.contact,
      statusCode: 200,
      ipAddress,
      userAgent,
    });

    return res.json({
      id: registration.id,
      message: "사전등록이 완료되었습니다.",
    });
  } catch (error) {
    await serverLog({
      event: "registration.domestic.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "DOMESTIC",
      applicantName: name,
      contact,
      errorMessage: error.message,
      statusCode: 500,
      ipAddress,
      userAgent,
    });
    return res.status(500).json({ error: "등록 처리 중 오류가 발생했습니다." });
  }
});

app.post("/api/register/foreigner", async (req, res) => {
  const { ipAddress, userAgent } = getRequestMeta(req);
  const body = req.body || {};

  await serverLog({
    event: "registration.foreigner.attempt",
    category: "REGISTRATION",
    status: "ATTEMPT",
    registrationType: "FOREIGNER",
    applicantName: body.name,
    contact: body.contact,
    ipAddress,
    userAgent,
    metadata: { payload: sanitizePayload(body) },
  });

  const {
    name,
    title,
    affiliation,
    contact,
    privacyConsent,
    password,
    nationality,
    passportNumber,
    arrivalDate,
    departureDate,
    dietary,
    accommodation,
    accommodationDays,
    vehicleUsage,
    specialRequests,
  } = body;

  if (
    !name ||
    !title ||
    !affiliation ||
    !contact ||
    !password ||
    !nationality ||
    !passportNumber ||
    !arrivalDate ||
    !departureDate
  ) {
    const errorMessage = "Please fill in all required fields.";
    await serverLog({
      event: "registration.foreigner.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "FOREIGNER",
      applicantName: name,
      contact,
      errorMessage,
      statusCode: 400,
      ipAddress,
      userAgent,
      metadata: { payload: sanitizePayload(body) },
    });
    return res.status(400).json({ error: errorMessage });
  }

  if (accommodation && !accommodationDays) {
    const errorMessage = "Please enter the number of accommodation nights.";
    await serverLog({
      event: "registration.foreigner.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "FOREIGNER",
      applicantName: name,
      contact,
      errorMessage,
      statusCode: 400,
      ipAddress,
      userAgent,
    });
    return res.status(400).json({ error: errorMessage });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO registrations (
        type, name, title, affiliation, contact, privacy_consent, password_hash,
        nationality, passport_number, arrival_date, departure_date, dietary,
        accommodation, accommodation_days, vehicle_usage, special_requests,
        payment_status, amount, currency
      ) VALUES (
        'FOREIGNER',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PENDING',$16,$17
      ) RETURNING *`,
      [
        name,
        title,
        affiliation,
        contact,
        Boolean(privacyConsent),
        passwordHash,
        nationality,
        passportNumber,
        arrivalDate,
        departureDate,
        dietary || null,
        Boolean(accommodation),
        accommodation ? Number(accommodationDays) : null,
        Boolean(vehicleUsage),
        specialRequests || null,
        REGISTRATION_FEE.amount,
        REGISTRATION_FEE.currency,
      ],
    );
    const registration = result.rows[0];

    await serverLog({
      event: "registration.foreigner.success",
      category: "REGISTRATION",
      status: "SUCCESS",
      registrationType: "FOREIGNER",
      registrationId: registration.id,
      applicantName: registration.name,
      contact: registration.contact,
      statusCode: 200,
      ipAddress,
      userAgent,
      metadata: { paymentStatus: "PENDING" },
    });

    return res.json({
      id: registration.id,
      message: "Registration saved. Please proceed to payment.",
    });
  } catch (error) {
    await serverLog({
      event: "registration.foreigner.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "FOREIGNER",
      applicantName: name,
      contact,
      errorMessage: error.message,
      statusCode: 500,
      ipAddress,
      userAgent,
    });
    return res
      .status(500)
      .json({ error: "An error occurred during registration." });
  }
});

app.post("/api/payment/create-order", async (req, res) => {
  const { ipAddress, userAgent } = getRequestMeta(req);
  const { registrationId } = req.body || {};

  await serverLog({
    event: "payment.create_order.attempt",
    category: "PAYMENT",
    status: "ATTEMPT",
    registrationType: "FOREIGNER",
    registrationId,
    ipAddress,
    userAgent,
  });

  if (!registrationId) {
    return res.status(400).json({ error: "Registration ID is required." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM registrations WHERE id = $1",
      [registrationId],
    );
    const registration = result.rows[0];

    if (!registration || registration.type !== "FOREIGNER") {
      await serverLog({
        event: "payment.create_order.failure",
        category: "PAYMENT",
        status: "FAILURE",
        registrationId,
        errorMessage: "Registration not found.",
        statusCode: 404,
        ipAddress,
        userAgent,
      });
      return res.status(404).json({ error: "Registration not found." });
    }

    if (registration.payment_status === "PAID") {
      return res.status(400).json({ error: "Payment already completed." });
    }

    const order = await createPayPalOrder(
      registrationId,
      registration.amount || REGISTRATION_FEE.amount,
      registration.currency || REGISTRATION_FEE.currency,
    );

    await pool.query(
      "UPDATE registrations SET paypal_order_id = $1, updated_at = NOW() WHERE id = $2",
      [order.id, registrationId],
    );

    await serverLog({
      event: "payment.create_order.success",
      category: "PAYMENT",
      status: "SUCCESS",
      registrationType: "FOREIGNER",
      registrationId,
      applicantName: registration.name,
      contact: registration.contact,
      statusCode: 200,
      ipAddress,
      userAgent,
      metadata: { paypalOrderId: order.id },
    });

    return res.json({ orderId: order.id });
  } catch (error) {
    await serverLog({
      event: "payment.create_order.failure",
      category: "PAYMENT",
      status: "FAILURE",
      registrationType: "FOREIGNER",
      registrationId,
      errorMessage: error.message,
      statusCode: 500,
      ipAddress,
      userAgent,
    });
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/payment/capture", async (req, res) => {
  const { ipAddress, userAgent } = getRequestMeta(req);
  const { orderId, registrationId } = req.body || {};

  await serverLog({
    event: "payment.capture.attempt",
    category: "PAYMENT",
    status: "ATTEMPT",
    registrationType: "FOREIGNER",
    registrationId,
    ipAddress,
    userAgent,
    metadata: { orderId },
  });

  if (!orderId || !registrationId) {
    return res
      .status(400)
      .json({ error: "Order ID and registration ID are required." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM registrations WHERE id = $1",
      [registrationId],
    );
    const registration = result.rows[0];

    if (!registration || registration.type !== "FOREIGNER") {
      return res.status(404).json({ error: "Registration not found." });
    }

    if (registration.payment_status === "PAID") {
      return res.json({ success: true, alreadyPaid: true });
    }

    const capture = await capturePayPalOrder(orderId);
    const captureId =
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;

    await pool.query(
      `UPDATE registrations SET
        payment_status = 'PAID',
        paypal_order_id = $1,
        paypal_capture_id = $2,
        updated_at = NOW()
      WHERE id = $3`,
      [orderId, captureId, registrationId],
    );

    await serverLog({
      event: "payment.capture.success",
      category: "PAYMENT",
      status: "SUCCESS",
      registrationType: "FOREIGNER",
      registrationId,
      applicantName: registration.name,
      contact: registration.contact,
      statusCode: 200,
      ipAddress,
      userAgent,
      metadata: { orderId, paypalCaptureId: captureId },
    });

    return res.json({ success: true });
  } catch (error) {
    await pool.query(
      "UPDATE registrations SET payment_status = 'FAILED', updated_at = NOW() WHERE id = $1",
      [registrationId],
    );
    await serverLog({
      event: "payment.capture.failure",
      category: "PAYMENT",
      status: "FAILURE",
      registrationType: "FOREIGNER",
      registrationId,
      errorMessage: error.message,
      statusCode: 500,
      ipAddress,
      userAgent,
      metadata: { orderId },
    });
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/mypage/login", async (req, res) => {
  const { ipAddress, userAgent } = getRequestMeta(req);
  const { name, password } = req.body || {};

  await serverLog({
    event: "mypage.login.attempt",
    category: "MYPAGE",
    status: "ATTEMPT",
    applicantName: name,
    ipAddress,
    userAgent,
    metadata: { payload: sanitizePayload(req.body) },
  });

  if (!name || !password) {
    return res.status(400).json({ error: "이름과 비밀번호를 입력해주세요." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM registrations WHERE name = $1 ORDER BY created_at DESC LIMIT 1",
      [name],
    );
    const registration = result.rows[0];

    if (!registration) {
      await serverLog({
        event: "mypage.login.failure",
        category: "MYPAGE",
        status: "FAILURE",
        applicantName: name,
        errorMessage: "등록 정보를 찾을 수 없습니다.",
        statusCode: 404,
        ipAddress,
        userAgent,
      });
      return res.status(404).json({ error: "등록 정보를 찾을 수 없습니다." });
    }

    const valid = await verifyPassword(password, registration.password_hash);
    if (!valid) {
      await serverLog({
        event: "mypage.login.failure",
        category: "MYPAGE",
        status: "FAILURE",
        registrationType: registration.type,
        registrationId: registration.id,
        applicantName: name,
        errorMessage: "비밀번호가 일치하지 않습니다.",
        statusCode: 401,
        ipAddress,
        userAgent,
      });
      return res.status(401).json({ error: "비밀번호가 일치하지 않습니다." });
    }

    setSession(res, registration.id);
    await serverLog({
      event: "mypage.login.success",
      category: "MYPAGE",
      status: "SUCCESS",
      registrationType: registration.type,
      registrationId: registration.id,
      applicantName: registration.name,
      contact: registration.contact,
      statusCode: 200,
      ipAddress,
      userAgent,
    });
    return res.json({ success: true });
  } catch (error) {
    await serverLog({
      event: "mypage.login.failure",
      category: "MYPAGE",
      status: "FAILURE",
      applicantName: name,
      errorMessage: error.message,
      statusCode: 500,
      ipAddress,
      userAgent,
    });
    return res.status(500).json({ error: "인증 처리 중 오류가 발생했습니다." });
  }
});

app.post("/api/mypage/logout", (req, res) => {
  clearSession(res);
  res.json({ success: true });
});

app.get("/api/mypage/me", async (req, res) => {
  const sessionId = getSessionRegistrationId(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM registrations WHERE id = $1",
      [sessionId],
    );
    const registration = result.rows[0];
    if (!registration) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.json({ registration: serializeRegistration(registration) });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/mypage/me", async (req, res) => {
  const { ipAddress, userAgent } = getRequestMeta(req);
  const sessionId = getSessionRegistrationId(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body || {};

  try {
    const current = await pool.query(
      "SELECT * FROM registrations WHERE id = $1",
      [sessionId],
    );
    const registration = current.rows[0];
    if (!registration) {
      return res.status(404).json({ error: "Not found" });
    }

    await serverLog({
      event: "mypage.update.attempt",
      category: "MYPAGE",
      status: "ATTEMPT",
      registrationType: registration.type,
      registrationId: registration.id,
      applicantName: registration.name,
      contact: registration.contact,
      ipAddress,
      userAgent,
      metadata: { payload: sanitizePayload(body) },
    });

    const fields = {
      title: body.title ?? registration.title,
      affiliation: body.affiliation ?? registration.affiliation,
      contact: body.contact ?? registration.contact,
      privacy_consent: body.privacyConsent ?? registration.privacy_consent,
    };

    if (registration.type === "FOREIGNER") {
      Object.assign(fields, {
        nationality: body.nationality ?? registration.nationality,
        passport_number: body.passportNumber ?? registration.passport_number,
        arrival_date: body.arrivalDate ?? registration.arrival_date,
        departure_date: body.departureDate ?? registration.departure_date,
        dietary: body.dietary ?? registration.dietary,
        accommodation: body.accommodation ?? registration.accommodation,
        accommodation_days: body.accommodation
          ? body.accommodationDays
          : null,
        vehicle_usage: body.vehicleUsage ?? registration.vehicle_usage,
        special_requests: body.specialRequests ?? registration.special_requests,
      });
    }

    let passwordHash = registration.password_hash;
    if (body.password && String(body.password).length >= 4) {
      passwordHash = await hashPassword(body.password);
    }

    const result = await pool.query(
      `UPDATE registrations SET
        title = $1, affiliation = $2, contact = $3, privacy_consent = $4,
        nationality = $5, passport_number = $6, arrival_date = $7, departure_date = $8,
        dietary = $9, accommodation = $10, accommodation_days = $11,
        vehicle_usage = $12, special_requests = $13, password_hash = $14,
        updated_at = NOW()
      WHERE id = $15
      RETURNING *`,
      [
        fields.title,
        fields.affiliation,
        fields.contact,
        fields.privacy_consent,
        registration.type === "FOREIGNER" ? fields.nationality : registration.nationality,
        registration.type === "FOREIGNER" ? fields.passport_number : registration.passport_number,
        registration.type === "FOREIGNER" ? fields.arrival_date : registration.arrival_date,
        registration.type === "FOREIGNER" ? fields.departure_date : registration.departure_date,
        registration.type === "FOREIGNER" ? fields.dietary : registration.dietary,
        registration.type === "FOREIGNER" ? fields.accommodation : registration.accommodation,
        registration.type === "FOREIGNER" ? fields.accommodation_days : registration.accommodation_days,
        registration.type === "FOREIGNER" ? fields.vehicle_usage : registration.vehicle_usage,
        registration.type === "FOREIGNER" ? fields.special_requests : registration.special_requests,
        passwordHash,
        sessionId,
      ],
    );

    await serverLog({
      event: "mypage.update.success",
      category: "MYPAGE",
      status: "SUCCESS",
      registrationType: registration.type,
      registrationId: sessionId,
      applicantName: registration.name,
      contact: fields.contact,
      statusCode: 200,
      ipAddress,
      userAgent,
    });

    return res.json({
      registration: serializeRegistration(result.rows[0]),
      message: "정보가 저장되었습니다.",
    });
  } catch (error) {
    await serverLog({
      event: "mypage.update.failure",
      category: "MYPAGE",
      status: "FAILURE",
      registrationId: sessionId,
      errorMessage: error.message,
      statusCode: 500,
      ipAddress,
      userAgent,
    });
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/logs", async (req, res) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const status = req.query.status || "";
  const category = req.query.category || "";
  const limit = Math.min(Number(req.query.limit || 100), 500);

  const conditions = [];
  const values = [];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }
  values.push(limit);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const { rows } = await pool.query(
      `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
      values,
    );

    const summary = {
      total: rows.length,
      attempts: rows.filter((r) => r.status === "ATTEMPT").length,
      successes: rows.filter((r) => r.status === "SUCCESS").length,
      failures: rows.filter((r) => r.status === "FAILURE").length,
    };

    return res.json({ summary, logs: rows });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/registrations", async (req, res) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM registrations ORDER BY created_at DESC",
    );
    return res.json({ registrations: rows.map(serializeRegistration) });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          service: "apcse",
          level: "info",
          event: "server.start",
          port: PORT,
        })}\n`,
      );
    });
  })
  .catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "apcse",
        level: "error",
        event: "server.start_failure",
        errorMessage: error.message,
      })}\n`,
    );
    process.exit(1);
  });
