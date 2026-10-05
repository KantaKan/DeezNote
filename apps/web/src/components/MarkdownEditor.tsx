import { Crepe } from "@milkdown/crepe";
import { $remark } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/classic.css";
import { useEffect, useRef } from "react";

const MAX_IMAGE_EDGE = 1600;

async function prepareImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not encode image")), "image/webp", 0.82);
  });

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface MdastNode {
  type: string;
  title?: string | null;
  children?: MdastNode[];
}

// Milkdown 7.22 passes an image's missing title through as null, but its schema
// requires a string, so any note containing an image failed to render in the editor.
const imageTitleFix = $remark("imageTitleFix", () => () => (tree: MdastNode) => {
  const visit = (node: MdastNode) => {
    if ((node.type === "image" || node.type === "image-block") && node.title == null) node.title = "";
    node.children?.forEach(visit);
  };
  visit(tree);
});

interface Props {
  initialValue: string;
  onChange: (markdown: string) => void;
  /** Called with the processed photo's size before it's inserted; return false to cancel the insert. */
  canInsertImage?: (dataUrlBytes: number) => boolean;
}

export function MarkdownEditor({ initialValue, onChange, canInsertImage }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const canInsertImageRef = useRef(canInsertImage);
  canInsertImageRef.current = canInsertImage;

  useEffect(() => {
    if (!rootRef.current) return;

    // Crepe treats an empty URL as "cancelled", so a photo that doesn't fit is simply not inserted.
    const uploadImage = async (file: File) => {
      const dataUrl = await prepareImage(file);
      return canInsertImageRef.current && !canInsertImageRef.current(dataUrl.length) ? "" : dataUrl;
    };

    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: initialValueRef.current,
      features: {
        [Crepe.Feature.CodeMirror]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: uploadImage,
          inlineOnUpload: uploadImage,
          blockOnUpload: uploadImage,
          maxWidth: MAX_IMAGE_EDGE,
          maxHeight: MAX_IMAGE_EDGE,
        },
        [Crepe.Feature.Placeholder]: {
          text: "Type '/' for commands, or start writing…",
        },
      },
    });

    crepe.editor.use(imageTitleFix);

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (markdown !== previous) onChangeRef.current(markdown);
      });
    });

    void crepe.create();
    return () => { void crepe.destroy(); };
  }, []);

  return <div ref={rootRef} className="milkdown-host min-h-[calc(100vh-17rem)] pb-28" />;
}
