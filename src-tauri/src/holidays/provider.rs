use super::Holiday;
use chrono::{Datelike, NaiveDate};
use serde::Deserialize;
use std::{path::Path, time::Duration};

const ENDPOINT: &str =
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
const PAGE_SIZE: usize = 100;
const MAX_ITEMS: usize = 1000;
const KEY_VARIABLE: &str = "KASI_HOLIDAY_API_KEY";

pub fn load_key(config_dir: &Path) -> Option<String> {
    if let Ok(key) = std::env::var(KEY_VARIABLE) {
        if !key.trim().is_empty() {
            return Some(key);
        }
    }
    let mut paths = vec![config_dir.join(".env")];
    if cfg!(debug_assertions) {
        paths.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env"));
    }
    for path in paths {
        if let Ok(entries) = dotenvy::from_path_iter(path) {
            for (name, value) in entries.flatten() {
                if name == KEY_VARIABLE && !value.trim().is_empty() {
                    return Some(value);
                }
            }
        }
    }
    None
}

fn request_url(key: &str, year: i32, page: usize) -> Result<reqwest::Url, &'static str> {
    // Decode percent escapes once; query_pairs_mut encodes once and preserves literal '+'.
    let decoded = percent_encoding::percent_decode_str(key.trim())
        .decode_utf8()
        .map_err(|_| "invalid key format")?;
    let mut url = reqwest::Url::parse(ENDPOINT).map_err(|_| "invalid provider endpoint")?;
    url.query_pairs_mut()
        .append_pair("serviceKey", &decoded)
        .append_pair("solYear", &year.to_string())
        .append_pair("pageNo", &page.to_string())
        .append_pair("numOfRows", &PAGE_SIZE.to_string());
    Ok(url)
}

#[derive(Deserialize)]
struct Response {
    header: Header,
    body: Option<Body>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Header {
    result_code: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Body {
    #[serde(default)]
    items: Items,
    total_count: usize,
    page_no: usize,
}
#[derive(Default, Deserialize)]
struct Items {
    #[serde(default, rename = "item")]
    values: Vec<Item>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    locdate: String,
    date_name: String,
    is_holiday: String,
}

struct Page {
    holidays: Vec<Holiday>,
    count: usize,
    total: usize,
    page: usize,
}
fn normalize(xml: &str, year: i32) -> Result<Page, &'static str> {
    let response: Response =
        quick_xml::de::from_str(xml).map_err(|_| "invalid holiday response")?;
    if response.header.result_code != "00" {
        return Err("holiday provider rejected request");
    }
    let body = response.body.ok_or("missing holiday body")?;
    let count = body.items.values.len();
    let mut holidays = Vec::new();
    for item in body.items.values {
        if item.is_holiday != "Y" {
            continue;
        }
        let date = NaiveDate::parse_from_str(&item.locdate, "%Y%m%d")
            .map_err(|_| "invalid holiday date")?;
        if date.year() != year || item.date_name.trim().is_empty() {
            return Err("invalid holiday item");
        }
        holidays.push(Holiday {
            date: date.to_string(),
            name: item.date_name.trim().to_string(),
        });
    }
    Ok(Page {
        holidays,
        count,
        total: body.total_count,
        page: body.page_no,
    })
}

pub fn fetch(year: i32, key: &str) -> Result<Vec<Holiday>, &'static str> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "holiday client unavailable")?;
    let mut holidays = Vec::new();
    let mut seen = 0;
    let mut total = None;
    for page in 1..=10 {
        // Never propagate reqwest errors: their URL can contain the service key.
        let response = client
            .get(request_url(key, year, page)?)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|_| "holiday request failed")?;
        let xml = response
            .text()
            .map_err(|_| "holiday response unavailable")?;
        let data = normalize(&xml, year)?;
        if data.page != page
            || data.total > MAX_ITEMS
            || total.is_some_and(|value| value != data.total)
        {
            return Err("inconsistent holiday pages");
        }
        total = Some(data.total);
        seen += data.count;
        holidays.extend(data.holidays);
        if seen == data.total {
            holidays.sort_by(|a, b| (&a.date, &a.name).cmp(&(&b.date, &b.name)));
            holidays.dedup();
            return Ok(holidays);
        }
        if data.count == 0 || seen > data.total {
            return Err("incomplete holiday response");
        }
    }
    Err("holiday page limit reached")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalizes_official_flag_and_keeps_substitute_and_temporary_holidays() {
        let xml = r#"<response><header><resultCode>00</resultCode></header><body><items>
        <item><locdate>20261003</locdate><dateName>개천절</dateName><isHoliday>Y</isHoliday></item>
        <item><locdate>20261005</locdate><dateName>대체공휴일</dateName><isHoliday>Y</isHoliday></item>
        <item><locdate>20260901</locdate><dateName>임시 지정일</dateName><isHoliday>Y</isHoliday></item>
        <item><locdate>20260902</locdate><dateName>기념일</dateName><isHoliday>N</isHoliday></item>
        </items><totalCount>4</totalCount><pageNo>1</pageNo></body></response>"#;
        let page = normalize(xml, 2026).unwrap();
        assert_eq!(page.count, 4);
        assert_eq!(page.holidays.len(), 3);
        assert_eq!(
            page.holidays[0],
            Holiday {
                date: "2026-10-03".into(),
                name: "개천절".into()
            }
        );
        assert_eq!(page.holidays[1].name, "대체공휴일");
    }
    #[test]
    fn accepts_empty_year_but_rejects_error_and_malformed_payload() {
        let empty = r#"<response><header><resultCode>00</resultCode></header><body><items/><totalCount>0</totalCount><pageNo>1</pageNo></body></response>"#;
        assert!(normalize(empty, 2026).unwrap().holidays.is_empty());
        assert!(normalize(
            "<response><header><resultCode>30</resultCode></header></response>",
            2026
        )
        .is_err());
        assert!(normalize("not xml", 2026).is_err());
    }
    #[test]
    fn encoded_and_decoded_synthetic_keys_produce_same_query() {
        let raw = request_url("test+/=", 2026, 1).unwrap();
        assert_eq!(raw, request_url("test%2B%2F%3D", 2026, 1).unwrap());
        assert_eq!(
            raw.query_pairs()
                .find(|(name, _)| name == "serviceKey")
                .unwrap()
                .1,
            "test+/="
        );
    }
}
