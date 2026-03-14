import 'dotenv/config';
import { fetchPlaceDetails } from "./services/placesService.js";

async function test() {
    // ChIJm86q88oEzjkRw1n5E1o3vX0 is Pakistan or similar, let's search it first to get an ID
    const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
    const response = await fetch(TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({
            textQuery: "Pakistan",
            maxResultCount: 1,
        }),
    });
    const data = await response.json();
    if (data.places && data.places.length > 0) {
        const placeId = data.places[0].id;
        const result = await fetchPlaceDetails(placeId);
    } else {
    }
}
test();
