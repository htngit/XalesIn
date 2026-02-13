import { useState, useMemo } from 'react';
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    KeyboardSensor,
    DragStartEvent,
    DragEndEvent,
    closestCorners,
    defaultDropAnimationSideEffects,
    DropAnimation,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Contact, LEAD_STATUSES, LeadStatus } from '@/lib/services/types';
import { PipelineColumn } from './PipelineColumn';
import { PipelineCard } from './PipelineCard';
import { createPortal } from 'react-dom';

interface PipelineTabProps {
    contacts: Contact[];
    onContactMove: (contactId: string, newStatus: LeadStatus) => void;
    onCardClick?: (contact: Contact) => void;
}

const COLUMN_CONFIG: Record<LeadStatus, { title: string; color: string }> = {
    new: { title: 'New Lead', color: 'border-blue-500 bg-blue-50' },
    contacted: { title: 'Contacted', color: 'border-yellow-500 bg-yellow-50' },
    qualified: { title: 'Qualified', color: 'border-purple-500 bg-purple-50' },
    negotiation: { title: 'Negotiation', color: 'border-orange-500 bg-orange-50' },
    won: { title: 'Won', color: 'border-green-500 bg-green-50' },
    lost: { title: 'Lost', color: 'border-red-500 bg-red-50' },
};

export function PipelineTab({ contacts, onContactMove, onCardClick }: PipelineTabProps) {
    const [activeContact, setActiveContact] = useState<Contact | null>(null);

    // Group contacts by status
    // We use useMemo to avoid re-grouping on every render unless contacts change
    const columns = useMemo(() => {
        const cols: Record<string, Contact[]> = {};
        LEAD_STATUSES.forEach(status => {
            cols[status] = [];
        });

        contacts.forEach(contact => {
            const status = contact.lead_status || 'new';
            if (cols[status]) {
                cols[status].push(contact);
            } else {
                // Fallback for unknown status, put in 'new'
                cols['new'].push(contact);
            }
        });
        return cols;
    }, [contacts]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Start dragging after 5px movement
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const contact = contacts.find(c => c.id === active.id);
        setActiveContact(contact || null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over) {
            setActiveContact(null);
            return;
        }

        const activeId = active.id as string;
        const overId = over.id as string;

        // Find the container (column) of the over item
        // If over a column directly
        if (LEAD_STATUSES.includes(overId as LeadStatus)) {
            if (activeContact && (activeContact.lead_status || 'new') !== overId) {
                onContactMove(activeId, overId as LeadStatus);
            }
            setActiveContact(null);
            return;
        }

        // If over another card, find its contact to get status
        const overContact = contacts.find(c => c.id === overId);
        if (overContact && activeContact) {
            const newStatus = overContact.lead_status || 'new';
            const currentStatus = activeContact.lead_status || 'new';

            if (newStatus !== currentStatus) {
                onContactMove(activeId, newStatus as LeadStatus);
            }
        }

        setActiveContact(null);
    };

    const dropAnimation: DropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: {
                active: {
                    opacity: '0.5',
                },
            },
        }),
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full overflow-x-auto gap-4 py-4 px-2 items-start">
                {LEAD_STATUSES.map((status) => (
                    <PipelineColumn
                        key={status}
                        id={status}
                        title={COLUMN_CONFIG[status as LeadStatus]?.title || status}
                        color={COLUMN_CONFIG[status as LeadStatus]?.color || 'border-gray-300'}
                        contacts={columns[status] || []}
                        onCardClick={onCardClick}
                    />
                ))}
            </div>

            {createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeContact ? (
                        <PipelineCard contact={activeContact} />
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}
