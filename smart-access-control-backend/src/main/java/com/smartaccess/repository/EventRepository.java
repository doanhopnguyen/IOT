package com.smartaccess.repository;

import com.smartaccess.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<Event> {
    java.util.Optional<Event> findByEventUuid(String eventUuid);
}
