import { sampleJsonBills } from "../../plugins/sample-json-bills/plugin";
import type { BillboardPlugin } from "@/core/plugins";

/** Installed plugins. Add a plugin by importing it here; core services do not parse foreign formats. */
export const installedPlugins: BillboardPlugin[] = [sampleJsonBills];
