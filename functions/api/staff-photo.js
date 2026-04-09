import { STAFF_DIRECTORY } from "../../lib/staff-directory.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNameParts(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const firstName = url.searchParams.get("firstName");
    const lastName = url.searchParams.get("lastName");

    if (!firstName || !lastName) {
      return json({ ok: false, error: "Missing required query params: firstName and lastName." }, 400);
    }

    const firstKey = normalizeToken(firstName);
    const lastKey = normalizeToken(lastName);

    const match = STAFF_DIRECTORY.find((staff) => {
      const parts = parseNameParts(staff.name);
      return normalizeToken(parts.firstName) === firstKey && normalizeToken(parts.lastName) === lastKey;
    });

    if (!match) {
      return json({ ok: false, error: "No photo found for requested staff member." }, 404);
    }

    return json({
      ok: true,
      photoUrl: match.photo,
      name: match.name,
      title: match.title,
      department: match.department,
      phone: match.phone,
      group_id: match.group_id,
    });
  } catch {
    return json({ ok: false, error: "Backend roster load error." }, 502);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed. Use GET." }, 405);
  }
  return onRequestGet(context);
}
