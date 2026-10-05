import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

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

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
  process.exit(1);
}

const accounts = [
  {
    type: "admin",
    email: "admin@test.com",
    password: "admin123",
    name: "Admin Test"
  },
  {
    type: "customer",
    email: "customer@test.com",
    password: "customer123",
    name: "Customer Test"
  }
];

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

for (const account of accounts) {
  try {
    const result = await client.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { name: account.name, role: account.type },
      app_metadata: { role: account.type }
    });
    if (result.error) throw new Error(result.error.message);
    console.log(`Created ${account.type}: ${account.email}`);
  } catch (error) {
    console.error(`Failed for ${account.email}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.exitCode === undefined) {
  console.log("Done.");
} else {
  console.error("Finished with errors.");
  process.exit(process.exitCode);
}