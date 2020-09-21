import { ExportOption } from "./exportOption";

export interface ExportService {
    export(exportOption:ExportOption): void;
}