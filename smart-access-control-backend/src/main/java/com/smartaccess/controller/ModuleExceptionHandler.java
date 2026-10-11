package com.smartaccess.controller;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.dao.DataIntegrityViolationException;

@RestControllerAdvice(assignableTypes = {AccessLogController.class, AlertController.class, ImageUploadController.class})
public class ModuleExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ProblemDetail> status(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(ProblemDetail.forStatusAndDetail(e.getStatusCode(), e.getReason() == null?"Request failed":e.getReason()));
    }
    @ExceptionHandler({MethodArgumentNotValidException.class,
            MethodArgumentTypeMismatchException.class,
            jakarta.validation.ConstraintViolationException.class})
    public ResponseEntity<ProblemDetail> invalid(Exception e) {
        return ResponseEntity.badRequest().body(ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid request parameters"));
    }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ProblemDetail> tooLarge(Exception e) {
        return ResponseEntity.status(413).body(ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, "Maximum image size is 5 MiB"));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ProblemDetail> conflict(Exception e) {
        return ResponseEntity.status(409).body(ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Event conflicts with existing data; retry with its original UUID"));
    }
}
