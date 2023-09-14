import { Wrap } from './element-wrap';
import { UIToolkit } from './ui-toolkit';
import { MarkdownHelp } from './markdown-help';
import { InstanceConfig, PageInfo } from './models';

export type CommentEditorCallback = (ce: CommentEditor) => void;

export class CommentEditor extends Wrap<HTMLFormElement>{

    private readonly cbAnonymous?: Wrap<HTMLInputElement>;
    private readonly textarea: Wrap<HTMLTextAreaElement>;

    /**
     * Create a new editor for editing comment text.
     * @param parent Parent element to host the editor.
     * @param root Root element (for the markdown help popup).
     * @param isEdit Whether it's adding a new comment (false) or editing an existing one (true).
     * @param initialText Initial text to insert into the editor.
     * @param isAuthenticated Whether the user is authenticated.
     * @param config Comentario configuration obtained from the backend.
     * @param pageInfo Page data.
     * @param onCancel Cancel callback.
     * @param onSubmit Submit callback.
     */
    constructor(
        private readonly parent: Wrap<any>,
        root: Wrap<any>,
        isEdit: boolean,
        initialText: string,
        isAuthenticated: boolean,
        config: InstanceConfig,
        pageInfo: PageInfo,
        onCancel: CommentEditorCallback,
        onSubmit: CommentEditorCallback,
    ) {
        super(UIToolkit.form(() => onSubmit(this), () => onCancel(this)).element);

        // "Comment anonymously" checkbox
        let anonContainer: Wrap<any> | undefined;
        if (!isAuthenticated && pageInfo.authAnonymous && !isEdit) {
            this.cbAnonymous = Wrap.new('input').id(`anonymous-${Math.random()}`).attr({type: 'checkbox'});
            // Tick off and disable if only anonymous comments are possible
            if (!pageInfo.authLocal && !pageInfo.authSso && !pageInfo.idps?.length) {
                this.cbAnonymous.checked(true).attr({disabled: 'true'});
            }
            anonContainer = UIToolkit.div('checkbox-container')
                .append(
                    this.cbAnonymous,
                    Wrap.new('label').attr({for: this.cbAnonymous.getAttr('id')}).inner('Comment anonymously'));
        }

        // Set up the form
        this.classes('comment-editor')
            .append(
                // Textarea
                this.textarea = UIToolkit.textarea(null, true, true).attr({maxlength: '4096'}).value(initialText),
                // Textarea footer
                UIToolkit.div('comment-editor-footer')
                    .append(
                        // Markdown help button
                        UIToolkit.button(
                            '<b>M⬇</b>&nbsp;Markdown',
                            btn => MarkdownHelp.run(root, {ref: btn, placement: 'bottom-start'}, config)),
                        // Buttons
                        UIToolkit.div('comment-editor-buttons')
                            .append(
                                // Anonymous checkbox, if any
                                anonContainer,
                                // Cancel
                                UIToolkit.button('Cancel', () => onCancel(this)),
                                // Submit
                                UIToolkit.submit(isEdit ? 'Save Changes' : 'Add Comment', false))));

        // Update the parent
        this.parent.classes('editor-inserted').prepend(this);

        // Focus the textarea
        this.textarea.focus();
    }

    /**
     * Whether the Comment anonymously checkbox is ticked off.
     */
    get anonymous(): boolean {
        return !!this.cbAnonymous?.isChecked;
    }

    /**
     * Markdown text entered in the editor, trimmed of all leading and trailing whitespace.
     */
    get markdown(): string {
        return this.textarea.val.trim();
    }

    /**
     * Update the parent on editor removal.
     */
    override remove(): CommentEditor {
        this.parent.noClasses('editor-inserted');
        return super.remove() as CommentEditor;
    }
}
