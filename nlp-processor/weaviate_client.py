"""Weaviate client operations for managing testimonies and chunks."""

import json
from typing import Any, Dict, List

import httpx

from config import Config


async def weaviate_batch_insert(objects: List[Dict[str, Any]]) -> None:
    """Insert multiple objects into Weaviate using batch API.
    
    Args:
        objects: List of Weaviate object dictionaries with class and properties
        
    Raises:
        RuntimeError: If batch insert fails or returns errors
    """
    if not objects:
        print("[Weaviate] ⚠️  No objects to insert (empty list)")
        return
    
    print(f"[Weaviate] 📦 Attempting to insert {len(objects)} objects")
    
    headers = {"Content-Type": "application/json"}
    
    payload = {"objects": objects}
    
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{Config.WEAVIATE_URL}/v1/batch/objects",
            json=payload,
            headers=headers
        )
        response.raise_for_status()
        
        data = response.json() if response.text else {}
        
        # Weaviate may respond with "objects" or "results" depending on version
        items = []
        if isinstance(data, dict):
            if isinstance(data.get("objects"), list):
                items = data["objects"]
            elif isinstance(data.get("results"), list):
                items = data["results"]
        elif isinstance(data, list):
            # Sometimes Weaviate returns a list directly
            items = data
        
        # Check for item-level errors
        item_errors = []
        success_count = 0
        for idx, item in enumerate(items):
            result = (item or {}).get("result") or {}
            status = (result or {}).get("status")
            errors = (result or {}).get("errors")
            
            if status and str(status).upper() not in ("SUCCESS", "OK"):
                item_errors.append({"index": idx, "status": status, "errors": errors, "item": item})
            elif errors:
                item_errors.append({"index": idx, "status": status, "errors": errors, "item": item})
            else:
                success_count += 1
        
        if success_count > 0:
            print(f"[Weaviate] ✅ Successfully inserted {success_count}/{len(items)} objects")
        
        # Check for top-level errors
        top_errors = data.get("errors") if isinstance(data, dict) else None
        
        if top_errors or item_errors:
            raise RuntimeError(
                "Weaviate batch insert had errors:\n"
                + json.dumps(
                    {"top_errors": top_errors, "item_errors": item_errors[:5]},
                    indent=2
                )
            )


async def weaviate_upsert_object(
    class_name: str,
    object_id: str,
    properties: Dict[str, Any]
) -> None:
    """Upsert (create or update) a single object in Weaviate.
    
    Args:
        class_name: Weaviate class name
        object_id: UUID for the object
        properties: Object properties dictionary
        
    Raises:
        RuntimeError: If create/update operation fails
    """
    headers = {"Content-Type": "application/json"}
    # No se requieren headers adicionales para embeddings locales
    
    payload = {
        "class": class_name,
        "id": object_id,
        "properties": properties
    }
    
    async with httpx.AsyncClient(timeout=60) as client:
        # Try CREATE first
        response = await client.post(
            f"{Config.WEAVIATE_URL}/v1/objects",
            json=payload,
            headers=headers,
        )
        
        if response.status_code in (200, 201):
            return
        
        # If object exists (409), UPDATE instead
        if response.status_code in (409, 422): # 422 for some Weaviate versions
            update_response = await client.put(
                f"{Config.WEAVIATE_URL}/v1/objects/{class_name}/{object_id}",
                json=payload,
                headers=headers,
            )
            if update_response.status_code >= 300:
                raise RuntimeError(
                    f"Weaviate UPDATE failed ({class_name}/{object_id}): "
                    f"HTTP {update_response.status_code} {update_response.text}"
                )
            return
        
        # Any other status is a failure
        raise RuntimeError(
            f"Weaviate CREATE failed ({class_name}/{object_id}): "
            f"HTTP {response.status_code} {response.text}"
        )


async def weaviate_delete_chunks_by_story(testimony_uuid: str) -> Dict[str, Any]:
    """Delete all chunks associated with a specific testimony.
    
    Args:
        testimony_uuid: UUID of the testimony
        
    Returns:
        Response data from Weaviate
        
    Raises:
        httpx.HTTPStatusError: If delete operation fails
    """
    body = {
        "match": {
            "class": "Chunks",
            "where": {
                "path": ["theirstory_id"],
                "operator": "Equal",
                "valueString": testimony_uuid,
            },
        }
    }
    
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.request(
            method="DELETE",
            url=f"{Config.WEAVIATE_URL}/v1/batch/objects",
            json=body,
            headers={"Content-Type": "application/json"},
        )
        
        response.raise_for_status()
        return response.json() if response.text else {"ok": True}
