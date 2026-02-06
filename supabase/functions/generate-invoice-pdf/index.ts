import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  amount: number;
  due_date: string;
  status: string;
  created_at: string;
  invoice_items: InvoiceItem[];
}

const formatCurrency = (amount: number): string => {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { invoiceId } = await req.json();
    if (!invoiceId) {
      throw new Error("Invoice ID is required");
    }

    // Fetch the invoice with items
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select(`*, invoice_items(*)`)
      .eq("id", invoiceId)
      .eq("user_id", user.id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();

    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const primaryColor = rgb(0.13, 0.15, 0.18);
    const mutedColor = rgb(0.45, 0.47, 0.5);
    const accentColor = rgb(0.2, 0.4, 0.8);

    let y = height - 60;

    // Header - Invoice title
    page.drawText("INVOICE", {
      x: 50,
      y,
      size: 32,
      font: helveticaBold,
      color: primaryColor,
    });

    // Invoice number on the right
    page.drawText(invoice.invoice_number, {
      x: width - 150,
      y,
      size: 14,
      font: helveticaBold,
      color: accentColor,
    });

    y -= 40;

    // Status badge
    const statusText = invoice.status.toUpperCase();
    page.drawText(`Status: ${statusText}`, {
      x: 50,
      y,
      size: 10,
      font: helvetica,
      color: mutedColor,
    });

    y -= 50;

    // Bill To section
    page.drawText("BILL TO", {
      x: 50,
      y,
      size: 10,
      font: helveticaBold,
      color: mutedColor,
    });

    page.drawText("INVOICE DETAILS", {
      x: 350,
      y,
      size: 10,
      font: helveticaBold,
      color: mutedColor,
    });

    y -= 20;

    page.drawText(invoice.client_name, {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: primaryColor,
    });

    page.drawText(`Issue Date: ${formatDate(invoice.created_at)}`, {
      x: 350,
      y,
      size: 10,
      font: helvetica,
      color: primaryColor,
    });

    y -= 16;

    page.drawText(invoice.client_email, {
      x: 50,
      y,
      size: 10,
      font: helvetica,
      color: mutedColor,
    });

    page.drawText(`Due Date: ${formatDate(invoice.due_date)}`, {
      x: 350,
      y,
      size: 10,
      font: helvetica,
      color: primaryColor,
    });

    y -= 60;

    // Table header
    const tableTop = y;
    page.drawRectangle({
      x: 50,
      y: tableTop - 5,
      width: width - 100,
      height: 25,
      color: rgb(0.95, 0.95, 0.97),
    });

    page.drawText("Description", { x: 55, y: tableTop, size: 10, font: helveticaBold, color: primaryColor });
    page.drawText("Qty", { x: 320, y: tableTop, size: 10, font: helveticaBold, color: primaryColor });
    page.drawText("Rate", { x: 380, y: tableTop, size: 10, font: helveticaBold, color: primaryColor });
    page.drawText("Amount", { x: 470, y: tableTop, size: 10, font: helveticaBold, color: primaryColor });

    y = tableTop - 35;

    // Table rows
    const items = invoice.invoice_items || [];
    for (const item of items) {
      page.drawText(item.description || "Services", { x: 55, y, size: 10, font: helvetica, color: primaryColor });
      page.drawText(String(item.quantity), { x: 320, y, size: 10, font: helvetica, color: primaryColor });
      page.drawText(formatCurrency(item.rate), { x: 380, y, size: 10, font: helvetica, color: primaryColor });
      page.drawText(formatCurrency(item.amount), { x: 470, y, size: 10, font: helvetica, color: primaryColor });
      y -= 25;
    }

    // Divider line
    y -= 10;
    page.drawLine({
      start: { x: 350, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: rgb(0.9, 0.9, 0.9),
    });

    y -= 25;

    // Total
    page.drawText("Total Amount", { x: 350, y, size: 12, font: helveticaBold, color: primaryColor });
    page.drawText(formatCurrency(Number(invoice.amount)), { x: 470, y, size: 14, font: helveticaBold, color: accentColor });

    // Footer
    page.drawText("Thank you for your business!", {
      x: 50,
      y: 80,
      size: 10,
      font: helvetica,
      color: mutedColor,
    });

    page.drawText("Generated by GRX10 Business Suite", {
      x: 50,
      y: 60,
      size: 8,
      font: helvetica,
      color: mutedColor,
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
