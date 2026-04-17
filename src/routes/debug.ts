import type { FastifyInstance } from 'fastify';
import { launchBrowser, newContext } from '../scraper/browser.js';
import { buildMmtSearchUrl } from '../scraper/urlBuilder.js';

export async function registerDebugRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { city?: string; checkIn?: string; checkOut?: string } }>(
    '/debug/mmt-listing',
    async (request, reply) => {
      const city = request.query.city ?? 'Mumbai';
      const checkIn = request.query.checkIn ?? '2026-05-10';
      const checkOut = request.query.checkOut ?? '2026-05-12';

      const url = buildMmtSearchUrl({
        city,
        checkIn,
        checkOut,
        adults: 2,
        children: 0,
        rooms: 1,
        limit: 20,
      });

      const t0 = Date.now();
      const browser = await launchBrowser();
      const context = await newContext(browser);
      const page = await context.newPage();

      let navStatus: number | null = null;
      try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        navStatus = resp?.status() ?? null;
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);

        const finalUrl = page.url();
        const title = await page.title().catch(() => '');
        const html = await page.content();
        const initial = await page
          .evaluate(() => {
            const raw = (window as unknown as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__;
            if (!raw || typeof raw !== 'object') return { present: false };
            const s = raw as Record<string, unknown>;
            const hl = (s.hotelListing as Record<string, unknown> | undefined) ?? {};
            return {
              present: true,
              topKeys: Object.keys(s).slice(0, 20),
              hotelListingKeys: Object.keys(hl).slice(0, 20),
              reportedTotal: typeof hl.totalHotelsCount === 'number' ? hl.totalHotelsCount : null,
            };
          })
          .catch(() => ({ present: false, evalError: true }));

        const hotelLinks = await page.evaluate(() => {
          const links = Array.from(
            document.querySelectorAll<HTMLAnchorElement>('a[href*="/hotels/"]')
          )
            .map((a) => a.href)
            .filter((h) => /makemytrip\.com\/hotels\//.test(h));
          return Array.from(new Set(links)).slice(0, 10);
        });

        const bodySnippet = html.slice(0, 1500);
        const hasCaptchaHint = /captcha|access denied|are you human|bot|blocked|unauthorized/i.test(
          html.slice(0, 10_000)
        );

        return reply.send({
          ok: true,
          requestedCity: city,
          builtUrl: url,
          finalUrl,
          navStatus,
          title,
          htmlLength: html.length,
          hasCaptchaHint,
          initialState: initial,
          hotelLinksFound: hotelLinks.length,
          sampleHotelLinks: hotelLinks,
          bodySnippet,
          elapsedMs: Date.now() - t0,
        });
      } catch (err) {
        return reply.code(500).send({
          ok: false,
          requestedCity: city,
          builtUrl: url,
          navStatus,
          error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
          elapsedMs: Date.now() - t0,
        });
      } finally {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      }
    }
  );
}
