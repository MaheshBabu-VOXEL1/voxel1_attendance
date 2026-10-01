// Main service for the self-hosted Edge Runtime (Docker).
// Routes /<function-name>/... to the matching folder in /home/deno/functions
// by spawning a user worker, mirroring Supabase's self-hosted router.

const FUNCTIONS_ROOT = "/home/deno/functions";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  const { pathname } = new URL(req.url);
  // Accept both /<name> and /functions/v1/<name> (Kong forwards the full path).
  const name = pathname.replace(/^\/functions\/v1(?=\/|$)/, "").split("/").filter(Boolean)[0];

  if (!name || name === "main" || name.startsWith("_")) {
    return json(200, { status: "ok", service: "voxel1-edge-runtime" });
  }

  const servicePath = `${FUNCTIONS_ROOT}/${name}`;
  try {
    await Deno.stat(servicePath);
  } catch {
    return json(404, { error: `Function not found: ${name}` });
  }

  try {
    // Pass the container's env (service keys, DEMO_USER_PASSWORD, etc.) through.
    const envVars = Object.entries(Deno.env.toObject());
    // @ts-ignore EdgeRuntime is provided by supabase/edge-runtime
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(`[main] ${name} failed:`, e);
    return json(500, { error: String(e) });
  }
});
