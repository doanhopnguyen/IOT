package com.smartaccess.controller;
import com.smartaccess.service.FaceMediaService;
import com.smartaccess.dto.FaceDtos.Profile;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class FaceMediaController {
    private final FaceMediaService service;
    public FaceMediaController(FaceMediaService service) { this.service=service; }
    @PostMapping(value="/api/faces/me/media",consumes="multipart/form-data")
    public Profile upload(@RequestParam MultipartFile file,@RequestParam boolean consent) {
        return service.register(file,consent);
    }
}
