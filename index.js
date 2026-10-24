
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    const reply = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method !== "POST") {
      return reply({ error: "POST required" }, 405);
    }

    try {
      const url = new URL(request.url);
      const body = await request.json();

      if (url.pathname.startsWith("/admin/")) {
        if (!env.ADMIN_SECRET ||
            request.headers.get("Authorization") !==
              `Bearer ${env.ADMIN_SECRET}`) {
          return reply({ error: "Unauthorized" }, 401);
        }

        if (url.pathname === "/admin/create") {
          const code = body.code ||
            ("SAQR-" + crypto.randomUUID().replace(/-/g, "")
              .slice(0, 12).toUpperCase());

          const key = "license:" + code;
          if (await env.LICENSES.get(key)) {
            return reply({ error: "Code already exists" }, 409);
          }

          await env.LICENSES.put(key, JSON.stringify({
            deviceId: null,
            revoked: false,
            createdAt: new Date().toISOString()
          }));

          return reply({ success: true, code });
        }

        if (url.pathname === "/admin/revoke") {
          if (!body.code) return reply({ error: "Code required" }, 400);
          const key = "license:" + body.code;
          const record = await env.LICENSES.get(key, "json");
          if (!record) return reply({ error: "License not found" }, 404);

          record.revoked = true;
          await env.LICENSES.put(key, JSON.stringify(record));
          return reply({ success: true, revoked: true });
        }

        return reply({ error: "Unknown admin endpoint" }, 404);
      }

      if (url.pathname === "/activate" ||
          url.pathname === "/verify") {
        const { code, deviceId } = body;
        if (!code || !deviceId) {
          return reply({ error: "Code and deviceId required" }, 400);
        }

        const key = "license:" + code;
        const record = await env.LICENSES.get(key, "json");

        if (!record || record.revoked) {
          return reply({ success: false, error: "Invalid or revoked code" }, 403);
        }

        if (record.deviceId && record.deviceId !== deviceId) {
          return reply({ success: false, error: "Code used on another device" }, 403);
        }

        if (url.pathname === "/activate" && !record.deviceId) {
          record.deviceId = deviceId;
          record.activatedAt = new Date().toISOString();
          await env.LICENSES.put(key, JSON.stringify(record));
        }

        return reply({ success: true, active: true });
      }

      return reply({ error: "Not found" }, 404);
    } catch {
      return reply({ error: "Invalid request" }, 400);
    }
  }
};
