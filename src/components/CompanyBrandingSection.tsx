import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ImageIcon, Upload, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";

interface BrandingData {
  company_id: number;
  company_name: string;
  logo: string | null;
  logo_url: string | null;
  logo_alt: string;
  updated_at: string;
}

const MAX_SIZE = 500 * 1024; // 500 KB
const MAX_WIDTH = 600;
const MAX_HEIGHT = 200;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function validateFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return resolve("Formato inválido. Use PNG, JPG ou WebP.");
    }
    if (file.size > MAX_SIZE) {
      return resolve(`Arquivo muito grande (máx. 500 KB). Atual: ${(file.size / 1024).toFixed(0)} KB.`);
    }
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      if (img.width > MAX_WIDTH || img.height > MAX_HEIGHT) {
        return resolve(`Dimensões máximas: ${MAX_WIDTH}×${MAX_HEIGHT}px. Atual: ${img.width}×${img.height}px.`);
      }
      resolve(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve("Não foi possível ler a imagem.");
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function CompanyBrandingSection() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { data: branding, isLoading } = useQuery<BrandingData>({
    queryKey: ["company-branding"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/company-branding/");
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      await fetchCsrf();
      const fd = new FormData();
      fd.append("logo", file);
      const { data } = await api.patch("/api/settings/company-branding/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data as BrandingData;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["company-branding"], data);
      setPreview(null);
      toast.success("Logo atualizado com sucesso");
    },
    onError: () => toast.error("Erro ao enviar logo"),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await fetchCsrf();
      const { data } = await api.patch("/api/settings/company-branding/", { remove_logo: true });
      return data as BrandingData;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["company-branding"], data);
      setPreview(null);
      toast.success("Logo removido");
    },
    onError: () => toast.error("Erro ao remover logo"),
  });

  const isBusy = uploadMutation.isPending || removeMutation.isPending;

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const err = await validateFile(file);
    if (err) {
      toast.error(err);
      return;
    }

    setPreview(URL.createObjectURL(file));
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  const logoUrl = preview ?? branding?.logo_url;

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Logo</span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>

      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-4"
        style={{ background: "hsl(var(--surface))" }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Preview */}
            <div
              className="flex items-center justify-center rounded-lg border border-dashed border-border p-6"
              style={{ background: "hsl(var(--surface-elevated))", minHeight: 80 }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={branding?.logo_alt || "Logo da empresa"}
                  className="max-h-[120px] max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageIcon className="h-8 w-8 opacity-40" />
                  <span className="text-xs">Nenhum logo definido</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => fileRef.current?.click()}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                )}
                {logoUrl ? "Trocar logo" : "Enviar logo"}
              </Button>

              {branding?.logo_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeMutation.mutate()}
                >
                  {removeMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Remover
                </Button>
              )}
            </div>

            {/* Specs hint */}
            <p className="text-[10px] text-muted-foreground">
              PNG, JPG ou WebP · máx. 500 KB · até 600×200 px
            </p>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
