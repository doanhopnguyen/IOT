package com.smartaccess.dto;

public record ImageUploadResponse(String id, String url, String contentType, long size, Long faceRequestId) {}
