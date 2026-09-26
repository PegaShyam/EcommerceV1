import type { Request as ExpressRequest, Response } from "express";
import { eq } from "drizzle-orm";
import { getEnv } from "../lib/env";
import { db } from "../db";
import { users } from "../db/schema";
import { parseRole } from "../lib/roles";
import { verifyWebhook } from "@clerk/express/webhooks";

export const clerkWebhookHandler = async (req: ExpressRequest, res: Response) => {
    const env = getEnv();

    try {
        // Verify the webhook signature exists; if the signature is invalid, this will throw an error
        // without it we cannot trust incoming requests are from Clerk
        if (!env.CLERK_WEBHOOK_SECRET) {
            res.status(503).send("Clerk webhook secret is not configured");
            return;
        }
        //@clerk/express's verifyWebhook takes the raw Express request directly - it handles
        //header and raw-body conversion internally, so we don't need to build a Fetch Request ourselves.
        //throws if signature was wrong and the body was tampered with; only if it passes we trust evt. (evt stands for event here)
        const evt = await verifyWebhook(req, { signingSecret: env.CLERK_WEBHOOK_SECRET });

        if (evt.type === "user.created" || evt.type === "user.updated") {
            const u = evt.data;

            const email = u.email_addresses?.find((e) => e.id === u.primary_email_address_id)?.email_address ?? u.email_addresses?.[0]?.email_address;

            const displayName =
                [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || null;

            const role = parseRole(u.public_metadata?.role);

            await db.insert(users).values({
                clerkUserId: u.id,
                email,
                displayName,
                role
            }).onConflictDoUpdate({
                target: users.clerkUserId,
                set: { email, displayName, role, updatedAt: new Date() },
            })
        }

        if (evt.type === "user.deleted") {
            const id = evt.data.id
            if (id) {
                await db.delete(users).where(eq(users.clerkUserId, id))
            }
        }

        res.json({ ok: true })
    }

    catch (error) {
        // Bad signature, malformed payload, or DB error - do not leak details to the client.
        console.error("Clerk webhook error", error);
        if (!res.headersSent) {
            res.status(400).send("Webhook verification failed");
        }
    }
}