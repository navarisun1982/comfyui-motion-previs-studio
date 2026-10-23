import { templateRegistry, RegisteredTemplate } from './templateRegistry';
import { ApiWorkflow } from './templateTypes';
import { parseBinding } from './templateVerifier';
import { logger } from '../stores/useLogStore';

/**
 * Automatically discovers and registers all validated ComfyUI API templates
 * and companion binding files located in `workflows/templates/`.
 */
export function loadBundledTemplates(): RegisteredTemplate[] {
  const apiModules = import.meta.glob<Record<string, unknown>>('/workflows/templates/*.api.json', {
    eager: true,
    import: 'default',
  });
  const bindingModules = import.meta.glob<Record<string, unknown>>('/workflows/templates/*.binding.json', {
    eager: true,
    import: 'default',
  });

  const registered: RegisteredTemplate[] = [];

  for (const [bindingPath, rawBinding] of Object.entries(bindingModules)) {
    try {
      const parsed = parseBinding(rawBinding, bindingPath);
      if (!parsed.binding) {
        logger.error(`Failed to parse template binding at ${bindingPath}: ${parsed.errors.join('; ')}`);
        continue;
      }
      const binding = parsed.binding;
      const apiPath = bindingPath.replace('.binding.json', '.api.json');
      const api = apiModules[apiPath] as ApiWorkflow | undefined;

      if (!api) {
        logger.warn(`Template binding at ${bindingPath} has no companion API file at ${apiPath}`);
        continue;
      }

      const reg = templateRegistry.register(binding, api);
      if (reg.verification.ok) {
        logger.workflow(`Registered verified workflow template: ${binding.templateId} (${binding.engine})`);
        registered.push(reg);
      } else {
        logger.error(`Template verification failed for ${binding.templateId}: ${reg.verification.errors.join('; ')}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to process template binding at ${bindingPath}: ${msg}`);
    }
  }

  return registered;
}
