import { ApiWorkflow, TemplateBinding, EngineId, GenerationMode } from './templateTypes';
import { verifyBinding, VerificationResult } from './templateVerifier';
import { hashValue } from './hash';

export interface RegisteredTemplate {
  binding: TemplateBinding;
  api: ApiWorkflow;
  templateHash: string;
  verification: VerificationResult;
}

class TemplateRegistry {
  private templates = new Map<string, RegisteredTemplate>();

  register(binding: TemplateBinding, api: ApiWorkflow): RegisteredTemplate {
    const verification = verifyBinding(api, binding);
    const templateHash = hashValue(api);
    const reg: RegisteredTemplate = {
      binding,
      api,
      templateHash,
      verification,
    };
    this.templates.set(binding.templateId, reg);
    return reg;
  }

  get(templateId: string): RegisteredTemplate | undefined {
    return this.templates.get(templateId);
  }

  find(engine: EngineId, mode: GenerationMode): RegisteredTemplate | undefined {
    for (const reg of this.templates.values()) {
      if (reg.binding.engine === engine && reg.binding.modes.includes(mode) && reg.verification.ok) {
        return reg;
      }
    }
    return undefined;
  }

  list(): RegisteredTemplate[] {
    return Array.from(this.templates.values());
  }

  clear(): void {
    this.templates.clear();
  }
}

export const templateRegistry = new TemplateRegistry();
