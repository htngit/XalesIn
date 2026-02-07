-- Migration: add_scraper_selectors_config.sql

-- Insert default selectors for Google and Bing maps
INSERT INTO public.app_configs (key, value, description)
VALUES (
  'scraper_selectors',
  '{
    "google_maps": {
      "version": "2026-02-07",
      "selectors": {
        "results_container": "div[role=\"feed\"]",
        "business_card": "div.Nv2PK",
        "name": "div.qBF1Pd",
        "rating": "span.MW4etd",
        "reviews_count": "span.UY7F9",
        "phone": "span.UsdlK",
        "link": "a.hfpxzc",
        "address": "div.W4Efsd:nth-of-type(1) > span:nth-of-type(2) > span:nth-of-type(2)"
      },
      "fallback_selectors": {
        "business_card": ["div.Nv2PK", "div.lI9IFe", "[data-result-ad-type]"],
        "name": ["div.qBF1Pd", "h3.fontHeadlineSmall"],
        "phone": ["span.UsdlK", "[data-item-id*=\"phone\"]"]
      }
    },
    "bing_maps": {
      "version": "2026-02-07",
      "selectors": {
        "entity_data": "[data-entity]",
        "list_container": ".b_vList"
      }
    }
  }'::jsonb,
  'Dynamic CSS selectors for map scraping platforms. Update here when Google/Bing changes UI.'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
