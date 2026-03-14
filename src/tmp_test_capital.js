import 'dotenv/config';
import config from "./config/apiConfig.js";

async function test() {
    const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
    const response = await fetch(TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": config.googleMapsApiKey,
            "X-Goog-FieldMask": "places.displayName,places.addressComponents",
        },
        body: JSON.stringify({
            textQuery: "capital of Pakistan",
            maxResultCount: 1,
        }),
    });
    const data = await response.json();
}

test();
