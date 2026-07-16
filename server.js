require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");
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
  "admin-registrations.html",
  "preview.html",
];

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || "apcse2026!").trim();
const SESSION_COOKIE = "apcse_session";
const REGISTRATION_FEE = {
  amount: Number(process.env.REGISTRATION_FEE_AMOUNT || 100),
  currency: process.env.REGISTRATION_FEE_CURRENCY || "USD",
};
const SECRETARIAT_EMAIL = "apcse2026@i-csec.org";
const DOCUMENT_REQUEST_TYPES = new Set([
  "INVITATION",
  "PARTICIPATION",
  "VISA_SUPPORT",
  "OTHER",
]);
const HOTEL_FORM_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const HOTEL_FORM_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);
const PASSPORT_COPY_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
]);
const PASSPORT_COPY_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const BUILD_VERSION = "2026-07-16-regfix2";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser(process.env.SESSION_SECRET || "apcse-dev-secret"));
app.use(
  "/css",
  express.static(path.join(ROOT_DIR, "css"), {
    maxAge: 0,
    etag: true,
  }),
);
app.use("/files", express.static(path.join(ROOT_DIR, "files")));

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseBoolean(value) {
  return value === true || value === "true" || value === "yes" || value === "1";
}

function isAllowedUpload(file, allowedMimes, allowedExtensions) {
  if (!file) return false;
  if (allowedMimes.has(file.mimetype)) return true;
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  return allowedExtensions.has(ext);
}

function sendStoredFile(res, row, prefix) {
  if (!row) {
    return res.status(404).json({ error: "File not found." });
  }
  const filename = row[`${prefix}_filename`];
  const mimetype = row[`${prefix}_mimetype`];
  const data = row[`${prefix}_data`];
  if (!filename || !data) {
    return res.status(404).json({ error: "File not found." });
  }
  res.setHeader("Content-Type", mimetype || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/"/g, "")}"`,
  );
  return res.send(data);
}

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
  const inputPassword = String(req.headers["x-admin-password"] || "").trim();
  return inputPassword === ADMIN_PASSWORD;
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
    email: row.email,
    affiliationType: row.affiliation_type,
    affiliationTypeOther: row.affiliation_type_other,
    attendanceDates: row.attendance_dates || [],
    teacherDocumentNeeded: row.teacher_document_needed,
    givenName: row.given_name,
    familyName: row.family_name,
    preferredName: row.preferred_name,
    whatsappId: row.whatsapp_id,
    visaSupportNeeded: row.visa_support_needed,
    arrivalDatetime: row.arrival_datetime,
    departureDatetime: row.departure_datetime,
    arrivalFlightNumber: row.arrival_flight_number,
    departureFlightNumber: row.departure_flight_number,
    transportationOptions: row.transportation_options || [],
    accommodationType: row.accommodation_type,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    dietaryPreference: row.dietary_preference,
    dietaryDetails: row.dietary_details,
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
    documentRequests: row.document_requests || [],
    documentRequestOther: row.document_request_other,
    hasHotelForm: Boolean(row.hotel_form_filename),
    hotelFormFilename: row.hotel_form_filename,
    hasPassportCopy: Boolean(row.passport_copy_filename),
    passportCopyFilename: row.passport_copy_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const AFFILIATION_TYPES = new Set([
  "TEACHER_K12",
  "PROFESSOR",
  "STUDENT",
  "GOVERNMENT",
  "IT_EDU_CORP",
  "OTHER",
]);

function isValidPassword(password) {
  return /^[A-Za-z0-9]{4,8}$/.test(String(password));
}

function isValidPhone(phone) {
  return /^[0-9]{2,3}-[0-9]{3,4}-[0-9]{4}$/.test(String(phone));
}

function isValidInternationalPhone(phone) {
  return /^\+?[0-9][0-9\s\-()]{7,24}$/.test(String(phone).trim());
}

function splitDatetime(datetime) {
  if (!datetime || !datetime.includes("T")) {
    return { date: "", time: "" };
  }
  const [date, time] = datetime.split("T");
  return { date, time: time.slice(0, 5) };
}

const FOREIGNER_ATTENDANCE_DATES = new Set([
  "2026-10-14",
  "2026-10-15",
  "2026-10-16",
]);

const DIETARY_PREFERENCES = new Set([
  "NO_RESTRICTION",
  "VEGETARIAN",
  "HALAL",
  "NO_PORK",
  "NO_BEEF",
  "OTHER",
]);

const TRANSPORTATION_OPTIONS = new Set(["PICKUP", "DROPOFF", "NONE"]);

const ACCOMMODATION_TYPES = new Set(["ORGANIZER", "OWN"]);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, build: BUILD_VERSION });
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
    contact: body.phone || body.contact,
    ipAddress,
    userAgent,
    metadata: { payload: sanitizePayload(body) },
  });

  const {
    name,
    title,
    affiliation,
    affiliationType,
    affiliationTypeOther,
    phone,
    email,
    attendanceDates,
    teacherDocumentNeeded,
    privacyConsent,
    password,
  } = body;

  if (
    !name ||
    !title ||
    !affiliation ||
    !affiliationType ||
    !phone ||
    !email ||
    !password ||
    !Array.isArray(attendanceDates) ||
    !attendanceDates.length
  ) {
    const errorMessage = "필수 항목을 모두 입력해주세요.";
    await serverLog({
      event: "registration.domestic.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "DOMESTIC",
      applicantName: name,
      contact: phone,
      errorMessage,
      statusCode: 400,
      ipAddress,
      userAgent,
      metadata: { payload: sanitizePayload(body) },
    });
    return res.status(400).json({ error: errorMessage });
  }

  if (!privacyConsent) {
    const errorMessage = "개인정보 수집·이용에 동의해야 사전등록이 가능합니다.";
    await serverLog({
      event: "registration.domestic.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "DOMESTIC",
      applicantName: name,
      contact: phone,
      errorMessage,
      statusCode: 400,
      ipAddress,
      userAgent,
    });
    return res.status(400).json({ error: errorMessage });
  }

  if (!AFFILIATION_TYPES.has(affiliationType)) {
    const errorMessage = "소속 유형을 올바르게 선택해주세요.";
    return res.status(400).json({ error: errorMessage });
  }

  if (affiliationType === "OTHER" && !affiliationTypeOther) {
    const errorMessage = "기타 소속 유형을 입력해주세요.";
    return res.status(400).json({ error: errorMessage });
  }

  if (!isValidPhone(phone)) {
    const errorMessage = "휴대폰 번호는 하이픈(-)을 포함하여 입력해주세요.";
    return res.status(400).json({ error: errorMessage });
  }

  if (!email.includes("@")) {
    const errorMessage = "이메일 주소를 정확히 입력해주세요.";
    return res.status(400).json({ error: errorMessage });
  }

  const validDates = attendanceDates.every((date) =>
    ["2026-10-15", "2026-10-16"].includes(date),
  );
  if (!validDates) {
    const errorMessage = "참석 희망일을 올바르게 선택해주세요.";
    return res.status(400).json({ error: errorMessage });
  }

  if (!isValidPassword(password)) {
    const errorMessage = "비밀번호는 4~8자리 숫자/영문만 사용할 수 있습니다.";
    await serverLog({
      event: "registration.domestic.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "DOMESTIC",
      applicantName: name,
      contact: phone,
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
        type, name, title, affiliation, contact, email, privacy_consent, password_hash,
        affiliation_type, affiliation_type_other, attendance_dates, teacher_document_needed,
        payment_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'NOT_REQUIRED')
      RETURNING *`,
      [
        "DOMESTIC",
        name,
        title,
        affiliation,
        phone,
        email,
        true,
        passwordHash,
        affiliationType,
        affiliationType === "OTHER" ? affiliationTypeOther : null,
        attendanceDates,
        Boolean(teacherDocumentNeeded),
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

app.post(
  "/api/register/foreigner",
  upload.fields([
    { name: "hotelForm", maxCount: 1 },
    { name: "passportCopy", maxCount: 1 },
  ]),
  async (req, res) => {
  const { ipAddress, userAgent } = getRequestMeta(req);
  const body = req.body || {};

  await serverLog({
    event: "registration.foreigner.attempt",
    category: "REGISTRATION",
    status: "ATTEMPT",
    registrationType: "FOREIGNER",
    applicantName: body.givenName && body.familyName
      ? `${body.givenName} ${body.familyName}`
      : body.name,
    contact: body.phone || body.email || body.contact,
    ipAddress,
    userAgent,
    metadata: { payload: sanitizePayload(body) },
  });

  const {
    givenName,
    familyName,
    preferredName,
    email,
    phone,
    whatsappId,
    arrivalDatetime,
    departureDatetime,
    arrivalFlightNumber,
    departureFlightNumber,
    accommodationType,
    dietaryPreference,
    dietaryDetails,
    password,
  } = body;

  const attendanceDates = parseJsonArray(body.attendanceDates);
  const transportationOptions = parseJsonArray(body.transportationOptions);
  const documentRequests = parseJsonArray(body.documentRequests);
  const documentRequestOther = String(body.documentRequestOther || "").trim() || null;
  const visaSupportNeeded = documentRequests.includes("VISA_SUPPORT");
  const privacyConsent = parseBoolean(body.privacyConsent);
  const hotelFormFile = req.files?.hotelForm?.[0];
  const passportCopyFile = req.files?.passportCopy?.[0];

  const fullName =
    givenName && familyName ? `${String(givenName).trim()} ${String(familyName).trim()}` : "";

  if (
    !givenName ||
    !familyName ||
    !email ||
    !phone ||
    !whatsappId ||
    !password ||
    !Array.isArray(attendanceDates) ||
    !attendanceDates.length ||
    !arrivalDatetime ||
    !departureDatetime ||
    !arrivalFlightNumber ||
    !departureFlightNumber ||
    !Array.isArray(transportationOptions) ||
    !transportationOptions.length ||
    !dietaryPreference
  ) {
    const errorMessage = "Please fill in all required fields.";
    await serverLog({
      event: "registration.foreigner.failure",
      category: "REGISTRATION",
      status: "FAILURE",
      registrationType: "FOREIGNER",
      applicantName: fullName,
      contact: phone || email,
      errorMessage,
      statusCode: 400,
      ipAddress,
      userAgent,
      metadata: { payload: sanitizePayload(body) },
    });
    return res.status(400).json({ error: errorMessage });
  }

  if (!privacyConsent) {
    const errorMessage =
      "You must agree to the collection and use of personal information.";
    return res.status(400).json({ error: errorMessage });
  }

  if (!email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  if (!isValidInternationalPhone(phone) || !isValidInternationalPhone(whatsappId)) {
    return res
      .status(400)
      .json({ error: "Please enter a valid phone number with country code." });
  }

  const validAttendance = attendanceDates.every((date) =>
    FOREIGNER_ATTENDANCE_DATES.has(date),
  );
  if (!validAttendance) {
    return res.status(400).json({ error: "Please select valid participation dates." });
  }

  if (!DIETARY_PREFERENCES.has(dietaryPreference)) {
    return res.status(400).json({ error: "Please select a valid dietary preference." });
  }

  if (
    (dietaryPreference === "VEGETARIAN" || dietaryPreference === "OTHER") &&
    !dietaryDetails
  ) {
    return res.status(400).json({ error: "Please provide dietary preference details." });
  }

  const validTransport = transportationOptions.every((option) =>
    TRANSPORTATION_OPTIONS.has(option),
  );
  if (!validTransport) {
    return res
      .status(400)
      .json({ error: "Please select valid transportation options." });
  }

  if (documentRequests.some((item) => !DOCUMENT_REQUEST_TYPES.has(item))) {
    return res.status(400).json({ error: "Please select valid document request options." });
  }

  if (documentRequests.includes("OTHER") && !documentRequestOther) {
    return res
      .status(400)
      .json({ error: "Please specify your other document request." });
  }

  if (
    visaSupportNeeded &&
    !isAllowedUpload(passportCopyFile, PASSPORT_COPY_MIMES, PASSPORT_COPY_EXTENSIONS)
  ) {
    return res
      .status(400)
      .json({ error: "Please upload a passport copy for Visa Support Letter." });
  }

  if (accommodationType && !ACCOMMODATION_TYPES.has(accommodationType)) {
    return res.status(400).json({ error: "Please select a valid accommodation option." });
  }

  if (accommodationType === "ORGANIZER") {
    if (!isAllowedUpload(hotelFormFile, HOTEL_FORM_MIMES, HOTEL_FORM_EXTENSIONS)) {
      return res.status(400).json({
        error: "Please upload the completed hotel reservation form (PDF or Word).",
      });
    }
  }

  if (!isValidPassword(password)) {
    return res
      .status(400)
      .json({ error: "Password must be 4–8 characters using letters and numbers only." });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO registrations (
        type, name, title, affiliation, contact, email, privacy_consent, password_hash,
        given_name, family_name, preferred_name, whatsapp_id, attendance_dates,
        visa_support_needed, passport_number, arrival_datetime, departure_datetime,
        arrival_flight_number, departure_flight_number, transportation_options,
        accommodation_type, check_in_date, check_out_date, dietary_preference, dietary_details,
        hotel_form_filename, hotel_form_mimetype, hotel_form_data,
        document_requests, document_request_other,
        passport_copy_filename, passport_copy_mimetype, passport_copy_data,
        payment_status, amount, currency
      ) VALUES (
        'FOREIGNER',$1,'-','-',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,'PENDING',$31,$32
      ) RETURNING *`,
      [
        fullName,
        phone,
        email,
        true,
        passwordHash,
        givenName,
        familyName,
        preferredName || null,
        whatsappId,
        attendanceDates,
        visaSupportNeeded,
        null,
        arrivalDatetime,
        departureDatetime,
        arrivalFlightNumber,
        departureFlightNumber,
        transportationOptions,
        accommodationType || null,
        null,
        null,
        dietaryPreference,
        dietaryDetails || null,
        accommodationType === "ORGANIZER" ? hotelFormFile.originalname : null,
        accommodationType === "ORGANIZER" ? hotelFormFile.mimetype : null,
        accommodationType === "ORGANIZER" ? hotelFormFile.buffer : null,
        documentRequests.length ? documentRequests : null,
        documentRequestOther,
        visaSupportNeeded ? passportCopyFile.originalname : null,
        visaSupportNeeded ? passportCopyFile.mimetype : null,
        visaSupportNeeded ? passportCopyFile.buffer : null,
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
      applicantName: fullName,
      contact: phone || email,
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
  const givenName = String(req.body?.givenName || "").trim();
  const familyName = String(req.body?.familyName || "").trim();
  const legacyName = String(req.body?.name || "").trim();
  const password = req.body?.password;
  const loginDisplayName = familyName
    ? `${givenName} ${familyName}`
    : givenName || legacyName;

  await serverLog({
    event: "mypage.login.attempt",
    category: "MYPAGE",
    status: "ATTEMPT",
    applicantName: loginDisplayName,
    ipAddress,
    userAgent,
    metadata: { payload: sanitizePayload(req.body) },
  });

  if ((!givenName && !legacyName) || !password) {
    return res.status(400).json({ error: "이름과 비밀번호를 입력해주세요." });
  }

  try {
    let result;
    if (familyName) {
      result = await pool.query(
        `SELECT * FROM registrations
         WHERE lower(trim(given_name)) = lower($1)
           AND lower(trim(family_name)) = lower($2)
         ORDER BY created_at DESC
         LIMIT 1`,
        [givenName, familyName],
      );
    } else {
      const loginName = givenName || legacyName;
      result = await pool.query(
        `SELECT * FROM registrations
         WHERE lower(trim(name)) = lower($1)
         ORDER BY created_at DESC
         LIMIT 1`,
        [loginName],
      );
    }
    const registration = result.rows[0];

    if (!registration) {
      await serverLog({
        event: "mypage.login.failure",
        category: "MYPAGE",
        status: "FAILURE",
        applicantName: loginDisplayName,
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
        applicantName: loginDisplayName,
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
      applicantName: loginDisplayName,
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
      contact: body.contact ?? body.phone ?? registration.contact,
      email: body.email ?? registration.email,
      privacy_consent: body.privacyConsent ?? registration.privacy_consent,
      affiliation_type: body.affiliationType ?? registration.affiliation_type,
      affiliation_type_other:
        body.affiliationType === "OTHER"
          ? body.affiliationTypeOther
          : body.affiliationType
            ? null
            : registration.affiliation_type_other,
      attendance_dates: body.attendanceDates ?? registration.attendance_dates,
      teacher_document_needed:
        body.teacherDocumentNeeded ?? registration.teacher_document_needed,
      document_requests: body.documentRequests ?? registration.document_requests,
      document_request_other: body.documentRequestOther ?? registration.document_request_other,
    };

    if (Array.isArray(body.documentRequests)) {
      const invalidDocument = body.documentRequests.some(
        (item) => !DOCUMENT_REQUEST_TYPES.has(item),
      );
      if (invalidDocument) {
        return res.status(400).json({ error: "Invalid document request type." });
      }
      fields.document_requests = body.documentRequests;
      fields.document_request_other = body.documentRequests.includes("OTHER")
        ? body.documentRequestOther || null
        : null;
      if (registration.type === "FOREIGNER") {
        fields.visa_support_needed = body.documentRequests.includes("VISA_SUPPORT");
      }
    }

    if (registration.type === "FOREIGNER") {
      const arrivalDatetime =
        body.arrivalDatetime ||
        (body.arrivalDate && body.arrivalTime
          ? `${body.arrivalDate}T${body.arrivalTime}`
          : registration.arrival_datetime);
      const departureDatetime =
        body.departureDatetime ||
        (body.departureDate && body.departureTime
          ? `${body.departureDate}T${body.departureTime}`
          : registration.departure_datetime);

      Object.assign(fields, {
        given_name: body.givenName ?? registration.given_name,
        family_name: body.familyName ?? registration.family_name,
        preferred_name: body.preferredName ?? registration.preferred_name,
        whatsapp_id: body.whatsappId ?? registration.whatsapp_id,
        attendance_dates: body.attendanceDates ?? registration.attendance_dates,
        visa_support_needed:
          body.documentRequests !== undefined
            ? Array.isArray(body.documentRequests) &&
              body.documentRequests.includes("VISA_SUPPORT")
            : body.visaSupportNeeded ?? registration.visa_support_needed,
        passport_number: registration.passport_number,
        arrival_datetime: arrivalDatetime,
        departure_datetime: departureDatetime,
        arrival_flight_number:
          body.arrivalFlightNumber ?? registration.arrival_flight_number,
        departure_flight_number:
          body.departureFlightNumber ?? registration.departure_flight_number,
        transportation_options:
          body.transportationOptions ?? registration.transportation_options,
        accommodation_type: body.accommodationType ?? registration.accommodation_type,
        dietary_preference:
          body.dietaryPreference ?? registration.dietary_preference,
        dietary_details: body.dietaryDetails ?? registration.dietary_details,
      });

      if (fields.given_name && fields.family_name) {
        fields.name = `${fields.given_name} ${fields.family_name}`;
      } else {
        fields.name = registration.name;
      }
    }

    let passwordHash = registration.password_hash;
    if (body.password) {
      if (!isValidPassword(body.password)) {
        return res
          .status(400)
          .json({ error: "비밀번호는 4~8자리 숫자/영문만 사용할 수 있습니다." });
      }
      passwordHash = await hashPassword(body.password);
    }

    const result = await pool.query(
      `UPDATE registrations SET
        name = $1, title = $2, affiliation = $3, contact = $4, email = $5, privacy_consent = $6,
        affiliation_type = $7, affiliation_type_other = $8, attendance_dates = $9,
        teacher_document_needed = $10,
        given_name = $11, family_name = $12, preferred_name = $13, whatsapp_id = $14,
        visa_support_needed = $15, passport_number = $16, arrival_datetime = $17, departure_datetime = $18,
        arrival_flight_number = $19, departure_flight_number = $20, transportation_options = $21,
        accommodation_type = $22, check_in_date = $23, check_out_date = $24,
        dietary_preference = $25, dietary_details = $26, password_hash = $27,
        document_requests = $28, document_request_other = $29,
        updated_at = NOW()
      WHERE id = $30
      RETURNING *`,
      [
        registration.type === "FOREIGNER" ? fields.name : registration.name,
        registration.type === "DOMESTIC" ? fields.title : registration.title,
        registration.type === "DOMESTIC" ? fields.affiliation : registration.affiliation,
        fields.contact,
        fields.email,
        fields.privacy_consent,
        registration.type === "DOMESTIC" ? fields.affiliation_type : registration.affiliation_type,
        registration.type === "DOMESTIC" ? fields.affiliation_type_other : registration.affiliation_type_other,
        fields.attendance_dates ?? registration.attendance_dates,
        registration.type === "DOMESTIC" ? fields.teacher_document_needed : registration.teacher_document_needed,
        registration.type === "FOREIGNER" ? fields.given_name : registration.given_name,
        registration.type === "FOREIGNER" ? fields.family_name : registration.family_name,
        registration.type === "FOREIGNER" ? fields.preferred_name : registration.preferred_name,
        registration.type === "FOREIGNER" ? fields.whatsapp_id : registration.whatsapp_id,
        registration.type === "FOREIGNER" ? fields.visa_support_needed : registration.visa_support_needed,
        registration.type === "FOREIGNER" ? fields.passport_number : registration.passport_number,
        registration.type === "FOREIGNER" ? fields.arrival_datetime : registration.arrival_datetime,
        registration.type === "FOREIGNER" ? fields.departure_datetime : registration.departure_datetime,
        registration.type === "FOREIGNER" ? fields.arrival_flight_number : registration.arrival_flight_number,
        registration.type === "FOREIGNER" ? fields.departure_flight_number : registration.departure_flight_number,
        registration.type === "FOREIGNER" ? fields.transportation_options : registration.transportation_options,
        registration.type === "FOREIGNER" ? fields.accommodation_type : registration.accommodation_type,
        registration.check_in_date,
        registration.check_out_date,
        registration.type === "FOREIGNER" ? fields.dietary_preference : registration.dietary_preference,
        registration.type === "FOREIGNER" ? fields.dietary_details : registration.dietary_details,
        passwordHash,
        fields.document_requests ?? registration.document_requests,
        fields.document_request_other ?? registration.document_request_other,
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

app.post("/api/mypage/upload/hotel-form", upload.single("hotelForm"), async (req, res) => {
  const sessionId = getSessionRegistrationId(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!isAllowedUpload(req.file, HOTEL_FORM_MIMES, HOTEL_FORM_EXTENSIONS)) {
    return res.status(400).json({ error: "Please upload a PDF or Word file." });
  }
  try {
    await pool.query(
      `UPDATE registrations SET
        hotel_form_filename = $1,
        hotel_form_mimetype = $2,
        hotel_form_data = $3,
        updated_at = NOW()
      WHERE id = $4`,
      [req.file.originalname, req.file.mimetype, req.file.buffer, sessionId],
    );
    return res.json({ success: true, filename: req.file.originalname });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/mypage/upload/passport-copy", upload.single("passportCopy"), async (req, res) => {
  const sessionId = getSessionRegistrationId(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!isAllowedUpload(req.file, PASSPORT_COPY_MIMES, PASSPORT_COPY_EXTENSIONS)) {
    return res.status(400).json({ error: "Please upload a PDF or image file." });
  }
  try {
    await pool.query(
      `UPDATE registrations SET
        passport_copy_filename = $1,
        passport_copy_mimetype = $2,
        passport_copy_data = $3,
        updated_at = NOW()
      WHERE id = $4`,
      [req.file.originalname, req.file.mimetype, req.file.buffer, sessionId],
    );
    return res.json({ success: true, filename: req.file.originalname });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/mypage/files/hotel-form", async (req, res) => {
  const sessionId = getSessionRegistrationId(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await pool.query(
      "SELECT hotel_form_filename, hotel_form_mimetype, hotel_form_data FROM registrations WHERE id = $1",
      [sessionId],
    );
    return sendStoredFile(res, result.rows[0], "hotel_form");
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/mypage/files/passport-copy", async (req, res) => {
  const sessionId = getSessionRegistrationId(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await pool.query(
      "SELECT passport_copy_filename, passport_copy_mimetype, passport_copy_data FROM registrations WHERE id = $1",
      [sessionId],
    );
    return sendStoredFile(res, result.rows[0], "passport_copy");
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/registrations/:id/files/hotel-form", async (req, res) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await pool.query(
      "SELECT hotel_form_filename, hotel_form_mimetype, hotel_form_data FROM registrations WHERE id = $1",
      [req.params.id],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Registration not found." });
    }
    return sendStoredFile(res, result.rows[0], "hotel_form");
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/registrations/:id/files/passport-copy", async (req, res) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await pool.query(
      "SELECT passport_copy_filename, passport_copy_mimetype, passport_copy_data FROM registrations WHERE id = $1",
      [req.params.id],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Registration not found." });
    }
    return sendStoredFile(res, result.rows[0], "passport_copy");
  } catch {
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

app.use(express.static(ROOT_DIR));

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
