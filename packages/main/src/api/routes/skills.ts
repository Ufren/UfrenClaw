import type { IncomingMessage, ServerResponse } from 'http';
import { getAllSkillConfigs, updateSkillConfig } from '../../utils/skill-config';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';
import type { ClawHubInstallParams, ClawHubSearchParams, ClawHubUninstallParams } from '../../gateway/clawhub';

export async function handleSkillRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/skills/configs' && req.method === 'GET') {
    sendJson(res, 200, await getAllSkillConfigs());
    return true;
  }

  if (url.pathname === '/api/skills/config' && req.method === 'PUT') {
    try {
      const body = await parseJsonBody<{
        skillKey: string;
        apiKey?: string;
        env?: Record<string, string>;
      }>(req);
      sendJson(res, 200, await updateSkillConfig(body.skillKey, {
        apiKey: body.apiKey,
        env: body.env,
      }));
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/search' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<Partial<ClawHubSearchParams>>(req);
      if (!body || typeof body.query !== 'string') {
        sendJson(res, 400, { success: false, error: 'Missing "query" string.' });
        return true;
      }
      const params: ClawHubSearchParams = {
        query: body.query,
        ...(typeof body.limit === 'number' ? { limit: body.limit } : {}),
      };
      sendJson(res, 200, {
        success: true,
        results: await ctx.clawHubService.search(params),
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/install' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<Partial<ClawHubInstallParams>>(req);
      if (!body || typeof body.slug !== 'string') {
        sendJson(res, 400, { success: false, error: 'Missing "slug" string.' });
        return true;
      }
      const params: ClawHubInstallParams = {
        slug: body.slug,
        ...(typeof body.version === 'string' ? { version: body.version } : {}),
        ...(typeof body.force === 'boolean' ? { force: body.force } : {}),
      };
      await ctx.clawHubService.install(params);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/uninstall' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<Partial<ClawHubUninstallParams>>(req);
      if (!body || typeof body.slug !== 'string') {
        sendJson(res, 400, { success: false, error: 'Missing "slug" string.' });
        return true;
      }
      await ctx.clawHubService.uninstall({ slug: body.slug });
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/list' && req.method === 'GET') {
    try {
      sendJson(res, 200, { success: true, results: await ctx.clawHubService.listInstalled() });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/open-readme' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ slug?: string; skillKey?: string }>(req);
      await ctx.clawHubService.openSkillReadme(body.skillKey || body.slug || '', body.slug);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
