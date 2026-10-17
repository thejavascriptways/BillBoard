export type ImportRow = {
  name: string;
  payee: string;
  amount: string;
  dueDate: string;
  propertyName?: string | null;
  categoryName?: string | null;
  frequency?: string | null;
  notes?: string | null;
};

export type Importer = {
  id: string;
  label: string;
  parse: (text: string) => ImportRow[];
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  apiVersion: "1";
  permissions: Array<"import" | "export" | "notify">;
};

export type PluginApi = {
  registerImporter: (importer: Importer) => void;
};

export type BillboardPlugin = {
  manifest: PluginManifest;
  activate: (api: PluginApi) => void;
  deactivate?: () => void;
};

export class PluginHost {
  private importers = new Map<string, Importer>();
  private owners = new Map<string, string>();
  private active = new Set<string>();

  activate(plugin: BillboardPlugin): void {
    if (this.active.has(plugin.manifest.id)) return;
    plugin.activate({
      registerImporter: (importer) => {
        this.importers.set(importer.id, importer);
        this.owners.set(importer.id, plugin.manifest.id);
      },
    });
    this.active.add(plugin.manifest.id);
  }

  deactivate(plugin: BillboardPlugin): void {
    for (const [importerId, owner] of this.owners) {
      if (owner === plugin.manifest.id) {
        this.importers.delete(importerId);
        this.owners.delete(importerId);
      }
    }
    plugin.deactivate?.();
    this.active.delete(plugin.manifest.id);
  }

  listImporters(): Importer[] {
    return [...this.importers.values()];
  }

  parse(importerId: string, text: string): ImportRow[] {
    const importer = this.importers.get(importerId);
    if (!importer) throw new Error("That import format is not enabled.");
    return importer.parse(text);
  }
}
