package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.FaceRequestStatus;
import com.smartaccess.repository.FaceRequestRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.*;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ImageUploadServiceTest {
    @TempDir Path directory;
    CurrentAccountService current = mock(CurrentAccountService.class);
    FaceRequestRepository requests = mock(FaceRequestRepository.class);
    ImageUploadService service;
    Account owner;
    @BeforeEach
    void setup() {
        owner = new Account();
        owner.setAccountId(7L);
        when(current.requireAccount()).thenReturn(owner);
        service = new ImageUploadService(directory.toString(), current, requests, new ObjectMapper());
    }
    byte[] png() throws Exception {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    @Test
    void storesSafeFilenameAndDurableMetadataThenReadsOnlyForOwner() throws Exception {
        byte[] bytes = png();
        var response = service.upload(new MockMultipartFile("file", "../../escape.png", "image/png", bytes), null);
        assertThat(response.id()).matches("[0-9a-f-]{36}");
        assertThat(Files.readAllBytes(directory.resolve(response.id()+".png"))).isEqualTo(bytes);
        assertThat(Files.readString(directory.resolve(response.id()+".json"))).contains("\"ownerId\":7");
        assertThat(service.read(response.id()).resource().getContentAsByteArray()).isEqualTo(bytes);
        Account stranger = new Account();
        stranger.setAccountId(8L);
        when(current.requireAccount()).thenReturn(stranger);
        assertThatThrownBy(() -> service.read(response.id())).isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        assertThatThrownBy(() -> service.read("../../escape")).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rejectsEmptyOversizeFakeMimeAndMismatchedEncoding() throws Exception {
        assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", new byte[0]), null)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "x.png", "image/png", new byte[(int)ImageUploadService.MAX_SIZE+1]), null)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "x.png", "image/png", "not an image".getBytes()), null)).isInstanceOf(ResponseStatusException.class);
        byte[] bytes = png();
        assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "x.jpg", "image/jpeg", bytes), null)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "x.svg", "image/svg+xml", bytes), null)).isInstanceOf(ResponseStatusException.class);
        try (var files = Files.list(directory)) {
            assertThat(files.count()).isZero();
        }
    }

    @Test
    void linksOnlyPendingOwnedRequestAndManagerCanReadLinkedPhoto() throws Exception {
        FaceRequest r = new FaceRequest();
        r.setRequestId(1L);
        r.setAccount(owner);
        r.setStatus(FaceRequestStatus.PENDING);
        Account manager = new Account();
        manager.setAccountId(8L);
        AccessUnit unit = new AccessUnit();
        unit.setManager(manager);
        r.setAccessUnit(unit);
        when(requests.findById(1L)).thenReturn(Optional.of(r));
        var file = new MockMultipartFile("file", "face.png", "image/png", png());
        var result = service.upload(file, 1L);
        assertThat(result.faceRequestId()).isEqualTo(1L);
        when(current.requireAccount()).thenReturn(manager);
        assertThat(service.read(result.id()).contentType()).isEqualTo("image/png");
        assertThatThrownBy(() -> service.upload(file, 1L)).isInstanceOf(ResponseStatusException.class);
        when(current.requireAccount()).thenReturn(owner);
        r.setStatus(FaceRequestStatus.COMPLETED);
        assertThatThrownBy(() -> service.upload(file, 1L)).isInstanceOf(ResponseStatusException.class);
    }
}
