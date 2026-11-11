package com.smartaccess.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class GlobalExceptionHandlerTest {
    final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test void responseStatusReasonIsReturnedToClient() {
        var response = handler.status(new ResponseStatusException(HttpStatus.CONFLICT, "Chỉ nạp được thiết bị chờ nạp hoặc chưa có chủ cửa"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().message()).isEqualTo("Chỉ nạp được thiết bị chờ nạp hoặc chưa có chủ cửa");
    }

    @Test void missingReasonFallsBackToGenericText() {
        var response = handler.status(new ResponseStatusException(HttpStatus.NOT_FOUND));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().message()).isNotBlank();
    }
}
