package com.smartaccess.controller;

import com.smartaccess.dto.ImageUploadResponse;
import com.smartaccess.service.ImageUploadService;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/images")
public class ImageUploadController {
    private final ImageUploadService service;
    public ImageUploadController(ImageUploadService service) {
        this.service = service;
    }
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ImageUploadResponse upload(@RequestPart("file") MultipartFile file, @RequestParam(required = false) Long faceRequestId) {
        return service.upload(file, faceRequestId);
    }
    @GetMapping("/{id}")
    public ResponseEntity<Resource> read(@PathVariable String id) {
        var image = service.read(id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.contentType()))
            .contentLength(image.size()).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
            .body(image.resource());
    }
}
