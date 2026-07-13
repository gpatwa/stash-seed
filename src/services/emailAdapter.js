// Email adapter boundary (in-memory seed — no real provider wired).
/**
 * @typedef {Object} EmailMessage
 * @property {string} recipient
 * @property {string} subject
 * @property {string} body
 *
 * @typedef {Object} EmailAdapter
 * @property {string} name
 * @property {(message: EmailMessage) => Promise<void>} send
 */

/**
 * The ONLY adapter in this build. Throws on every send; there is no config,
 * env var, or argument that suppresses the throw (approval scope: no real
 * send path exists). Message names the capability AND the adapter, per the
 * playbook's canonical throwing-placeholder pattern.
 */
export class PlaceholderEmailAdapter {
  constructor() {
    this.name = "email-adapter-boundary";
  }
  async send() {
    throw new Error(
      "Email sending is not configured in this build (PlaceholderEmailAdapter).",
    );
  }
}
