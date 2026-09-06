import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Dev-only seed: creates the customer and admin test accounts via the
// service-role admin API (passwords hashed by Supabase server-side, exactly
// like the real sign-up flow). Never run against production.

const parseEnv = (file) => {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      })
  );
};

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };

if (process.env.NODE_ENV === "production" || env.SEED_DEV !== "1") {
  console.error("Refusing to seed. Set SEED_DEV=1 in a gitignored .env.local and never run with NODE_ENV=production.");
  process.exit(1);
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
  process.exit(1);
}

const accounts = [
  {
    type: "customer",
    email: env.SEED_CUSTOMER_EMAIL || "customer.test@example.com",
    password: env.SEED_CUSTOMER_PASSWORD || "CinemaTest!2026",
    name: "Customer Test"
  },
  {
    type: "admin",
    email: env.SEED_ADMIN_EMAIL || "admin.test@example.com",
    password: env.SEED_ADMIN_PASSWORD || "CinemaAdmin!2026",
    name: "Admin Test"
  }
];

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const { data: page, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError || !page) {
  console.error("Failed to list users:", listError?.message ?? "unknown error");
  process.exit(1);
}

for (const account of accounts) {
  try {
    const existing = page.users.find((user) => user.email?.toLowerCase() === account.email.toLowerCase());
    const metadata = { name: account.name, role: account.type };
    const appMetadata = { role: account.type };
    if (existing) {
      const result = await client.auth.admin.updateUserById(existing.id, {
        password: account.password,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata ?? {}), ...metadata },
        app_metadata: { ...(existing.app_metadata ?? {}), ...appMetadata }
      });
      if (result.error) throw new Error(result.error.message);
      console.log(`Updated ${account.type}: ${account.email}`);
    } else {
      const result = await client.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: appMetadata
      });
      if (result.error) throw new Error(result.error.message);
      console.log(`Created ${account.type}: ${account.email}`);
    }
  } catch (error) {
    console.error(`Failed for ${account.email}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.exitCode === undefined) {
  console.log("Seed complete.");
} else {
  console.error("Seed finished with errors.");
  process.exit(process.exitCode);
}