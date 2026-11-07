package com.smartaccess.controller;
import com.smartaccess.service.FaceMediaService;
import com.smartaccess.dto.FaceDtos.Profile;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.ResponseEntity;
import com.smartaccess.exception.GlobalExceptionHandler.ErrorResponse;

@RestController
public class FaceMediaController {
    private final FaceMediaService service;
    public FaceMediaController(FaceMediaService service) { this.service=service; }
    @PostMapping(value="/api/faces/me/media",consumes="multipart/form-data")
    public Profile upload(@RequestParam MultipartFile file,@RequestParam boolean consent) {
        return service.register(file,consent);
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> rejectedMedia(ResponseStatusException error) {
        String message=error.getReason()!=null?error.getReason():"Không xử lý được hồ sơ khuôn mặt. Thử lại sau.";
        return ResponseEntity.status(error.getStatusCode()).body(new ErrorResponse(error.getStatusCode().value(),message));
    }
}
