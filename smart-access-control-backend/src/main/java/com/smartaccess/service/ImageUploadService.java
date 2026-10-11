package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.dto.ImageUploadResponse;
import com.smartaccess.model.FaceRequest;
import com.smartaccess.model.enumtype.FaceRequestStatus;
import com.smartaccess.repository.FaceRequestRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.PathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.ImageIO;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service
public class ImageUploadService {
    public static final long MAX_SIZE = 5 * 1024 * 1024;
    private final Path directory;
    private final CurrentAccountService current;
    private final FaceRequestRepository requests;
    private final ObjectMapper mapper;
    public record Metadata(String id, Long ownerId, Long faceRequestId, String contentType, long size, String filename) {}
    public record StoredImage(Resource resource, String contentType, long size) {}
    public ImageUploadService(@Value("${app.upload-dir:./uploads}") String directory,
            CurrentAccountService current,
            FaceRequestRepository requests,
            ObjectMapper mapper) {
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        this.current = current;
        this.requests = requests;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public ImageUploadResponse upload(MultipartFile file, Long faceRequestId) {
        Long ownerId = current.requireAccount().getAccountId();
        if (faceRequestId != null) {
            FaceRequest request = requests.findById(faceRequestId).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Face request not found"));
            if (!ownerId.equals(request.getAccount().getAccountId())) throw new ResponseStatusException(FORBIDDEN,
                    "Face request owner required");
            if (request.getStatus() != FaceRequestStatus.PENDING) throw new ResponseStatusException(CONFLICT,
                    "Face request is no longer pending");
        }
        if (file == null || file.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Image file is empty");
        if (file.getSize()>MAX_SIZE) throw new ResponseStatusException(PAYLOAD_TOO_LARGE, "Maximum image size is 5 MiB");
        Map<String, String> extensions = Map.of("image/jpeg", "jpg", "image/png", "png");
        String type = file.getContentType();
        if (type == null || !extensions.containsKey(type)) throw new ResponseStatusException(UNSUPPORTED_MEDIA_TYPE,
                "Only JPEG and PNG images are supported");
        String id = UUID.randomUUID().toString();
        Path image = directory.resolve(id+"."+extensions.get(type));
        Path metadata = directory.resolve(id+".json");
        try {
            byte[] bytes = file.getBytes();
            // Verify actual encoding and dimensions before storage; never trust MIME or original filename.
            try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(stream);
                if (!readers.hasNext()) throw new ResponseStatusException(UNSUPPORTED_MEDIA_TYPE, "Invalid image data");
                var reader = readers.next();
                try {
                    reader.setInput(stream, true, true);
                    String format = reader.getFormatName();
                    if (!(type.equals("image/jpeg") && format.equalsIgnoreCase("JPEG")) && !(type.equals("image/png") && format.equalsIgnoreCase("PNG")))
                        throw new ResponseStatusException(UNSUPPORTED_MEDIA_TYPE, "Image content does not match MIME type");
                    if ((long)reader.getWidth(0)*reader.getHeight(0)>20_000_000L)
                        throw new ResponseStatusException(BAD_REQUEST, "Image exceeds 20 megapixels");
                    if (reader.read(0) == null) throw new ResponseStatusException(BAD_REQUEST, "Invalid image data");
                } finally {
                    reader.dispose();
                }
            } catch (IOException e) {
                throw new ResponseStatusException(UNSUPPORTED_MEDIA_TYPE, "Invalid or incomplete image data", e);
            }
            Files.createDirectories(directory);
            Files.write(image, bytes, StandardOpenOption.CREATE_NEW);
            try {
                Files.write(metadata,
                        mapper.writeValueAsBytes(new Metadata(id, ownerId, faceRequestId, type, bytes.length, image.getFileName().toString())),
                        StandardOpenOption.CREATE_NEW);
            } catch (IOException e) {
                Files.deleteIfExists(image);
                throw e;
            }
            return new ImageUploadResponse(id, "/api/images/"+id, type, bytes.length, faceRequestId);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException e) {
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "Could not validate or store image", e);
        }
    }

    @Transactional(readOnly = true)
    public StoredImage read(String id) {
        Long accountId = current.requireAccount().getAccountId();
        if (!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
            throw new ResponseStatusException(NOT_FOUND, "Image not found");
        try {
            Path meta = directory.resolve(id+".json");
            if (!Files.isRegularFile(meta, LinkOption.NOFOLLOW_LINKS)) throw new ResponseStatusException(NOT_FOUND, "Image not found");
            Metadata m = mapper.readValue(Files.readAllBytes(meta), Metadata.class);
            boolean allowed = accountId.equals(m.ownerId());
            if (!allowed && m.faceRequestId() != null) {
                var r = requests.findById(m.faceRequestId()).orElse(null);
                allowed = r != null && r.getAccessUnit().getManager() != null && accountId.equals(r.getAccessUnit().getManager().getAccountId());
            }
            if (!allowed) throw new ResponseStatusException(FORBIDDEN, "Image owner or face request manager required");
            Path path = directory.resolve(m.filename()).normalize();
            if (!path.getParent().equals(directory) || !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS))
                throw new ResponseStatusException(NOT_FOUND, "Image not found");
            return new StoredImage(new PathResource(path), m.contentType(), m.size());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException e) {
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "Could not read image", e);
        }
    }
}
