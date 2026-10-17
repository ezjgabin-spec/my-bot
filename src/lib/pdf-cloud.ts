// unpdf bundles PDF.js for serverless runtimes without native canvas binaries.
import { getDocumentProxy, extractText } from "unpdf";
export class PDFParse {
  private document: ReturnType<typeof getDocumentProxy>;
  constructor({ data }: { data: Uint8Array }) {
    this.document = getDocumentProxy(data);
  }
  async getInfo() {
    return { total: (await this.document).numPages };
  }
  async getText() {
    return {
      text: (await extractText(await this.document, { mergePages: true })).text,
    };
  }
  async destroy() {
    await (await this.document).loadingTask.destroy();
  }
}
